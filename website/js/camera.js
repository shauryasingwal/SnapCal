/* ═══════════════════════════════════════════════════════════════
   camera.js — real camera access via getUserMedia
   Handles: live preview, capture, front/back switch, gallery pick.
   AI hook-point: after capture, passes imageData to Meals module.
   Future: swap the passthrough for FoodRecognitionService.detectFood()
═══════════════════════════════════════════════════════════════ */

const Camera = (() => {

  let stream          = null;
  let facingMode      = 'environment'; // 'user' = front
  let hasMultipleCams = false;

  const $ = id => document.getElementById(id);

  /* ── Stream management ───────────────────────────────── */

  const startStream = async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width:  { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      const video = $('camera-stream');
      video.srcObject = stream;

      // Detect if device has more than one camera
      const devices = await navigator.mediaDevices.enumerateDevices();
      hasMultipleCams = devices.filter(d => d.kind === 'videoinput').length > 1;
      $('switch-camera-btn').style.visibility = hasMultipleCams ? 'visible' : 'hidden';

    } catch (err) {
      console.warn('Camera unavailable:', err.name);
      close();
      // Fall through to manual entry without a photo
      Meals.openEntryModal(null);
      App.showToast('Camera unavailable — logging manually', 'warning');
    }
  };

  const stopStream = () => {
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
      $('camera-stream').srcObject = null;
    }
  };

  /* ── Capture ─────────────────────────────────────────── */

  const capture = () => {
    const video  = $('camera-stream');
    const canvas = $('camera-canvas');

    canvas.width  = video.videoWidth  || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext('2d');

    // Mirror front camera so it matches user expectation
    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Reset transform
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const imageData = canvas.toDataURL('image/jpeg', 0.88);

    /*
     * ── AI HOOK-POINT ──────────────────────────────────────
     * Future: replace the passthrough below with:
     *   FoodRecognitionService.detectFood(imageData)
     *     .then(result => Meals.openEntryModal(imageData, null, result))
     * ──────────────────────────────────────────────────────
     */
    close();
    Meals.openEntryModal(imageData);
  };

  /* ── Camera switch ───────────────────────────────────── */

  const switchCamera = async () => {
    stopStream();
    facingMode = facingMode === 'environment' ? 'user' : 'environment';
    await startStream();
  };

  /* ── Gallery picker ──────────────────────────────────── */

  const pickFromGallery = () => {
    $('gallery-file-input').click();
  };

  const onGalleryFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      close();
      Meals.openEntryModal(ev.target.result);
    };
    reader.readAsDataURL(file);
    e.target.value = ''; // reset so same file can be re-picked
  };

  /* ── Flash toggle (UI only — real flash needs native layer) */

  const toggleFlash = () => {
    const btn = $('toggle-flash-btn');
    const on  = btn.getAttribute('aria-pressed') === 'true';
    btn.setAttribute('aria-pressed', String(!on));
    // Attempt track torch constraint (supported on Android Chrome)
    if (stream) {
      const [track] = stream.getVideoTracks();
      if (track && typeof track.applyConstraints === 'function') {
        track.applyConstraints({ advanced: [{ torch: !on }] }).catch(() => {});
      }
    }
  };

  /* ── Open / Close ────────────────────────────────────── */

  const open = () => {
    $('camera-overlay').hidden = false;
    $('toggle-flash-btn').setAttribute('aria-pressed', 'false');
    startStream();
  };

  const close = () => {
    stopStream();
    $('camera-overlay').hidden = true;
  };

  /* ── Init ────────────────────────────────────────────── */

  const init = () => {
    $('close-camera-btn').addEventListener('click',   close);
    $('shutter-btn').addEventListener('click',        capture);
    $('switch-camera-btn').addEventListener('click',  switchCamera);
    $('gallery-pick-btn').addEventListener('click',   pickFromGallery);
    $('gallery-file-input').addEventListener('change', onGalleryFile);
    $('toggle-flash-btn').addEventListener('click',   toggleFlash);

    // Close on escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !$('camera-overlay').hidden) close();
    });
  };

  return { init, open, close };

})();
