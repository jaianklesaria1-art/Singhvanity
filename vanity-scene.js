(function () {
  'use strict';

  function init() {
    if (typeof THREE === 'undefined') { setTimeout(init, 100); return; }

    const canvas = document.getElementById('vanity-canvas');
    if (!canvas) return;

    /* ═══════════════════════════════════════════
       RENDERER — alpha:true so video shows through
    ═══════════════════════════════════════════ */
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(innerWidth, innerHeight);
    renderer.setClearColor(0x000000, 0);   // fully transparent clear
    renderer.outputEncoding  = THREE.sRGBEncoding;
    renderer.toneMapping     = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    /* ── SCENE ── */
    const scene = new THREE.Scene();
    // No scene.background — transparent so scroll-video shows through

    /* ── CAMERA ── */
    const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.05, 200);
    camera.position.set(0, 0, 22);

    /* ═══════════════════════════════════════════
       SCROLL-DRIVEN VIDEO
       Seek video.currentTime = progress × duration
       on each animation frame (throttled to ~30fps
       updates to avoid browser seek-queue flooding)
    ═══════════════════════════════════════════ */
    const vid = document.getElementById('scroll-video');
    let vidReady   = false;
    let lastSeeked = -1;

    if (vid) {
      vid.addEventListener('loadedmetadata', () => { vidReady = true; });
      // Force load on iOS which ignores preload="auto"
      vid.load();
    }

    function seekVideo(t) {
      if (!vid || !vidReady || !vid.duration) return;
      const target = Math.max(0, Math.min(vid.duration, t * vid.duration));
      // Only seek when change > 1 frame @30fps to avoid queue flooding
      if (Math.abs(target - lastSeeked) < 0.033) return;
      vid.currentTime = target;
      lastSeeked = target;
    }

    /* ═══════════════════════════════════════════
       PHOTO PANELS — float over the video
       Each: [src, peakT, x, y, z, rotY, w, h]
    ═══════════════════════════════════════════ */
    const photoData = [
      ['photos/v1.png',  0.10,   0,  0.6,  8,  0.00, 3.8, 5.6],  // lounge
      ['photos/v5.png',  0.25,  -6,  0.0,  5, -0.38, 5.4, 3.3],  // wide lounge
      ['photos/v3.png',  0.38,   6,  0.6,  3,  0.36, 3.6, 5.4],  // Hollywood makeup
      ['photos/l1.png',  0.50,   0,  0.0,  0,  0.00, 3.4, 5.2],  // ornate door
      ['photos/v6.png',  0.60,  -5,  0.0, -4, -0.34, 5.2, 3.2],  // compact makeup
      ['photos/l3.png',  0.70,   5,  0.0, -7,  0.34, 3.2, 5.0],  // arch mirror
      ['photos/v8.png',  0.82,  -5,  0.0,-11, -0.32, 5.0, 3.1],  // kitchen/bath
      ['photos/l15.png', 0.93,   0,  0.0,-15,  0.00, 5.4, 3.3],  // floral lounge
    ];

    const loader = new THREE.TextureLoader();
    const panels  = [];  // { mat, frameMat, ringMesh, ringUnis, panelT }

    /* Energy ring shaders — same as 21dev EnergyRing */
    const ringVert = `void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
    const ringFrag = `
      uniform float time; uniform vec3 ringColor; uniform float ringOpacity;
      void main(){
        float a = ringOpacity*(0.55+0.45*sin(time*4.0));
        gl_FragColor = vec4(ringColor,a);
      }`;

    photoData.forEach(([src, panelT, x, y, z, rotY, w, h], idx) => {
      const group = new THREE.Group();
      group.position.set(x, y, z);
      group.rotation.y = rotY;
      scene.add(group);

      const geo = new THREE.PlaneGeometry(w, h, 1, 1);

      loader.load(src, (tex) => {
        tex.encoding = THREE.sRGBEncoding;

        // Photo
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0 });
        group.add(new THREE.Mesh(geo, mat));

        // Gold frame
        const edgesGeo = new THREE.EdgesGeometry(geo);
        const frameMat = new THREE.LineBasicMaterial({ color: 0xd4a017, transparent: true, opacity: 0 });
        group.add(new THREE.LineSegments(edgesGeo, frameMat));

        // Energy ring (21dev EnergyRing adapted)
        const r = Math.max(w, h) * 0.60;
        const ringGeo  = new THREE.RingGeometry(r * 0.90, r * 0.96, 64);
        const ringUnis = {
          time:        { value: 0 },
          ringColor:   { value: new THREE.Color(idx % 2 === 0 ? 0xd4a017 : 0xb91c1c) },
          ringOpacity: { value: 0 },
        };
        const ringMesh = new THREE.Mesh(ringGeo, new THREE.ShaderMaterial({
          uniforms: ringUnis, vertexShader: ringVert, fragmentShader: ringFrag,
          transparent: true, side: THREE.DoubleSide,
        }));
        ringMesh.rotation.z = idx * 0.6;
        group.add(ringMesh);

        panels.push({ mat, frameMat, ringMesh, ringUnis, panelT, idx });
      });
    });

    /* ═══════════════════════════════════════════
       GOLD PARTICLES (float over video like dust)
    ═══════════════════════════════════════════ */
    const PART = 1800;
    const pPos = new Float32Array(PART * 3);
    const pCol = new Float32Array(PART * 3);
    for (let i = 0; i < PART; i++) {
      pPos[i*3]   = (Math.random() - 0.5) * 60;
      pPos[i*3+1] = (Math.random() - 0.5) * 30;
      pPos[i*3+2] = (Math.random() - 0.5) * 60;
      const g = Math.random();
      pCol[i*3]   = 0.84 + g * 0.16;
      pCol[i*3+1] = 0.56 + g * 0.24;
      pCol[i*3+2] = g * 0.08;
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    pGeo.setAttribute('color',    new THREE.BufferAttribute(pCol, 3));
    scene.add(new THREE.Points(pGeo, new THREE.PointsMaterial({
      size: 0.065, vertexColors: true, transparent: true, opacity: 0.5, sizeAttenuation: true,
    })));

    /* ── AMBIENT LIGHT ── */
    scene.add(new THREE.AmbientLight(0xffe4a0, 0.5));

    /* ═══════════════════════════════════════════
       CAMERA PATH — floats slowly as scroll advances
    ═══════════════════════════════════════════ */
    const camPath = new THREE.CatmullRomCurve3([
      new THREE.Vector3(  0,  0.5, 22),
      new THREE.Vector3(  2,  0.5, 14),
      new THREE.Vector3( -5,  0.0,  8),
      new THREE.Vector3(  5,  0.5,  4),
      new THREE.Vector3(  0,  0.0,  1),
      new THREE.Vector3( -5,  0.0, -3),
      new THREE.Vector3(  4,  0.0, -7),
      new THREE.Vector3( -4,  0.0,-11),
      new THREE.Vector3(  0,  0.0,-14),
    ], false, 'catmullrom', 0.5);

    const lookPath = new THREE.CatmullRomCurve3([
      new THREE.Vector3(  0,  0.4, 10),
      new THREE.Vector3(  0,  0.5, 10),
      new THREE.Vector3( -6,  0.0,  5),
      new THREE.Vector3(  6,  0.5,  3),
      new THREE.Vector3(  0,  0.0,  0),
      new THREE.Vector3( -5,  0.0, -4),
      new THREE.Vector3(  5,  0.0, -7),
      new THREE.Vector3( -5,  0.0,-11),
      new THREE.Vector3(  0,  0.0,-15),
    ], false, 'catmullrom', 0.5);

    /* ── SCROLL STATE ── */
    let raw = 0, smooth = 0;
    window.addEventListener('scroll', () => {
      const hero = document.getElementById('hero');
      if (!hero) return;
      raw = Math.min(1, Math.max(0, scrollY / (hero.offsetHeight - innerHeight)));
    }, { passive: true });

    /* ── TEXT MILESTONES ── */
    const milestones = [
      { from: 0.00, heading: 'Singh Vanity',
        sub: 'Step inside Mumbai\'s most luxurious vanity vans on rent' },
      { from: 0.12, heading: 'Art Deco Lounge',
        sub: 'L-shaped sofa · handcrafted teak table · ambient mood lighting' },
      { from: 0.28, heading: 'Signature Interiors',
        sub: 'Every detail thoughtfully crafted — from the ceiling to the flooring' },
      { from: 0.45, heading: 'Hollywood Makeup Studio',
        sub: 'Globe-lit mirrors · professional vanity stations · plush seating' },
      { from: 0.68, heading: 'Every Space, Perfected',
        sub: 'Private bathroom · full kitchen · wardrobe — a star\'s home away from home' },
      { from: 0.90, heading: 'Book Your Date',
        sub: 'Call +91 98889 65635  ·  singhvanity@gmail.com' },
    ];

    const headEl   = document.getElementById('scene-heading');
    const subEl    = document.getElementById('scene-sub');
    const textWrap = document.getElementById('scene-text-wrap');
    const hintEl   = document.getElementById('scene-hint');
    const ctaEl    = document.getElementById('scene-cta');
    const barFill  = document.getElementById('scene-bar-fill');
    let lastM = null;

    function updateText(t) {
      if (barFill) barFill.style.height = (t * 100) + '%';
      if (hintEl)  hintEl.style.opacity  = t < 0.07 ? String(1 - t / 0.07) : '0';
      if (ctaEl) {
        const op = t > 0.90 ? Math.min(1, (t - 0.90) / 0.10) : 0;
        ctaEl.style.opacity      = String(op);
        ctaEl.style.pointerEvents = op > 0.5 ? 'auto' : 'none';
      }

      let active = milestones[0];
      milestones.forEach(m => { if (t >= m.from) active = m; });
      if (active !== lastM) {
        lastM = active;
        if (textWrap) { textWrap.style.opacity = '0'; textWrap.style.transform = 'translateY(18px)'; }
        setTimeout(() => {
          if (headEl) headEl.textContent = active.heading;
          if (subEl)  subEl.textContent  = active.sub;
          if (textWrap) { textWrap.style.opacity = '1'; textWrap.style.transform = 'translateY(0)'; }
        }, 280);
      }
    }

    /* ── SCENE UPDATE ── */
    const camPos = new THREE.Vector3();
    const lookAt = new THREE.Vector3();

    function updateScene(t) {
      camPath.getPoint(t, camPos);
      lookPath.getPoint(t, lookAt);
      camera.position.copy(camPos);
      camera.lookAt(lookAt);
    }

    /* ── ANIMATE LOOP ── */
    let clock = 0;

    function animate() {
      requestAnimationFrame(animate);
      clock += 0.016;
      smooth += (raw - smooth) * 0.038;

      // ── Seek video to scroll position ──
      seekVideo(smooth);

      // ── Photo panel visibility (fade in/out around each panel's peakT) ──
      panels.forEach(({ mat, frameMat, ringMesh, ringUnis, panelT, idx }) => {
        const diff = Math.abs(smooth - panelT);
        const fade = diff < 0.07 ? 1.0 : diff < 0.20 ? 1.0 - (diff - 0.07) / 0.13 : 0.0;

        mat.opacity      = fade;
        frameMat.opacity = fade * 0.9;

        if (ringUnis) {
          ringUnis.time.value        = clock;
          ringUnis.ringOpacity.value = fade * 0.55;
          if (ringMesh) ringMesh.rotation.z = clock * (0.30 + idx * 0.06);
        }
      });

      updateScene(smooth);
      updateText(smooth);
      renderer.render(scene, camera);
    }

    /* ── RESIZE ── */
    window.addEventListener('resize', () => {
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(innerWidth, innerHeight);
    });

    // Boot
    updateScene(0);
    if (headEl)   headEl.textContent = milestones[0].heading;
    if (subEl)    subEl.textContent  = milestones[0].sub;
    if (textWrap) { textWrap.style.opacity = '1'; textWrap.style.transform = 'translateY(0)'; }
    animate();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
