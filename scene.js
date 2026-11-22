(function () {
  const canvas = document.getElementById('cozyScene');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W, H;

  function resize() {
    const rect = canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    W = rect.width || 280;
    H = rect.height || 105;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  // Slow, gentle falling snow
  const snowflakes = Array.from({ length: 38 }, () => ({
    x: Math.random() * 400,
    y: Math.random() * 110,
    r: Math.random() * 1.3 + 0.5,
    vy: Math.random() * 0.14 + 0.06,
    vx: (Math.random() - 0.5) * 0.08,
    alpha: Math.random() * 0.45 + 0.25
  }));

  const embers = Array.from({ length: 10 }, () => ({
    x: 0, y: 0, vy: 0, vx: 0, life: 0, maxLife: 1
  }));

  const steams = Array.from({ length: 6 }, (_, i) => ({
    offset: i * 0.35
  }));

  // Glowing winter butterfly state
  let butterfly = {
    active: false,
    x: 0,
    y: 0,
    baseY: 0,
    timer: 0,
    leaving: false
  };

  // Cat state machine
  // States: sit_by_man -> walk_out -> spin -> roll -> chase_butterfly -> nap -> wake_stretch -> walk_back
  let cat = {
    x: 0,
    homeX: 0,
    playX: 0,
    dir: -1,
    state: 'sit_by_man',
    timer: 0,
    walkPhase: 0,
    jumpY: 0,
    jumpVy: 0,
    jumpsDone: 0
  };

  let t = 0;

  function drawPineTree(x, y, scale, color) {
    ctx.fillStyle = color;
    for (let i = 0; i < 3; i++) {
      const w = (18 - i * 4) * scale;
      const h = 16 * scale;
      const topY = y - (14 + i * 10) * scale;
      ctx.beginPath();
      ctx.moveTo(x, topY);
      ctx.lineTo(x - w, topY + h);
      ctx.lineTo(x + w, topY + h);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawButterfly(b, time) {
    if (!b.active) return;
    ctx.save();
    ctx.translate(b.x, b.y);

    // Subtle glow around the butterfly for visibility at night
    const glow = ctx.createRadialGradient(0, 0, 1, 0, 0, 10);
    glow.addColorStop(0, 'rgba(125, 211, 252, 0.45)');
    glow.addColorStop(1, 'rgba(125, 211, 252, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();

    // Wing flapping animation
    const flap = Math.abs(Math.sin(time * 18));
    ctx.fillStyle = '#7dd3fc';
    // Front wing
    ctx.beginPath();
    ctx.ellipse(-1.5, -1.5, 3.2, 2.2 * flap + 0.5, -0.4, 0, Math.PI * 2);
    ctx.fill();
    // Back wing
    ctx.fillStyle = '#bae6fd';
    ctx.beginPath();
    ctx.ellipse(1.5, -1, 2.5, 1.8 * flap + 0.4, 0.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawCat(c, groundY, time) {
    ctx.save();
    ctx.translate(c.x, groundY + c.jumpY);

    // Smooth horizontal flip while spinning in place
    let scaleX = c.dir;
    if (c.state === 'spin') {
      scaleX = Math.cos(c.timer * 5.5) >= 0 ? 1 : -1;
    }
    ctx.scale(scaleX, 1);

    const isWalking = c.state === 'walk_out' || c.state === 'walk_back';
    const bob = isWalking ? Math.abs(Math.sin(c.walkPhase)) * 1.4 : 0;

    // Ground shadow (shrinks slightly when jumping)
    const shadowScale = Math.max(0.4, 1 + c.jumpY / 25);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.beginPath();
    ctx.ellipse(0, -c.jumpY, 9 * shadowScale, 2.2 * shadowScale, 0, 0, Math.PI * 2);
    ctx.fill();

    // 1. Rolling and rubbing on the snow
    if (c.state === 'roll') {
      const wiggle = Math.sin(time * 9) * 0.25;
      ctx.rotate(wiggle);

      // Excited tail wag
      ctx.strokeStyle = '#e67e22';
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-7, -3);
      ctx.quadraticCurveTo(-13, -7 + Math.sin(time * 14) * 4, -10, -11);
      ctx.stroke();

      // Body lying on its back/side
      ctx.fillStyle = '#ff9f43';
      ctx.beginPath();
      ctx.ellipse(0, -4.5, 8.5, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Paws playful movement in the air
      const pawMove = Math.sin(time * 12) * 1.8;
      ctx.strokeStyle = '#ffbe76';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-3, -7); ctx.lineTo(-4, -11 + pawMove);
      ctx.moveTo(2, -7); ctx.lineTo(3, -11 - pawMove);
      ctx.stroke();

      // Tilted happy head
      ctx.fillStyle = '#ff9f43';
      ctx.beginPath();
      ctx.arc(7, -5.5, 4.5, 0, Math.PI * 2);
      ctx.fill();
      // Ears
      ctx.beginPath();
      ctx.moveTo(4, -8.5); ctx.lineTo(5, -12); ctx.lineTo(7, -9);
      ctx.moveTo(8, -9); ctx.lineTo(10, -12); ctx.lineTo(11, -8);
      ctx.fill();
      // Happy closed eye (^_^)
      ctx.strokeStyle = '#2d1600';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(6.5, -5.5); ctx.quadraticCurveTo(8, -7, 9.5, -5.5);
      ctx.stroke();

      ctx.restore();
      return;
    }

    // 2. Lying down and taking a deep nap (25 seconds)
    if (c.state === 'nap') {
      // Slow breathing tail sway
      const tailBreath = Math.sin(time * 1.8) * 1.5;
      ctx.strokeStyle = '#e67e22';
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-6, -2.5);
      ctx.quadraticCurveTo(-11, -3 + tailBreath, -8, -7);
      ctx.stroke();

      // Stretched sleeping body with gentle breathing motion
      const breath = Math.sin(time * 2) * 0.4;
      ctx.fillStyle = '#ff9f43';
      ctx.beginPath();
      ctx.ellipse(-1, -4, 8.5, 4.2 + breath, 0, 0, Math.PI * 2);
      ctx.fill();

      // Extended front paws
      ctx.fillStyle = '#ffbe76';
      ctx.beginPath();
      ctx.roundRect(5, -2.5, 5, 2.5, 1.2);
      ctx.fill();

      // Head resting on the ground
      ctx.fillStyle = '#ff9f43';
      ctx.beginPath();
      ctx.arc(6.5, -5.5, 4.5, 0, Math.PI * 2);
      ctx.fill();

      // Ears
      ctx.beginPath();
      ctx.moveTo(3.5, -8.5); ctx.lineTo(4.5, -12); ctx.lineTo(6.5, -9);
      ctx.moveTo(7.5, -9); ctx.lineTo(9.5, -12); ctx.lineTo(10.5, -8);
      ctx.fill();

      // Closed sleeping eye
      ctx.strokeStyle = '#2d1600';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(6, -5.5); ctx.quadraticCurveTo(7.5, -4, 9, -5.5);
      ctx.stroke();

      // Floating "z" while napping
      const zPhase = (time * 0.4) % 1;
      ctx.save();
      ctx.scale(scaleX, 1); // Keep letter unmirrored
      ctx.fillStyle = `rgba(255, 190, 118, ${(1 - zPhase) * 0.75})`;
      ctx.font = 'bold 7px monospace';
      ctx.fillText('z', 5 * scaleX + zPhase * 4, -12 - zPhase * 9);
      ctx.restore();

      ctx.restore();
      return;
    }

    // 3. Waking up, stretching, and wagging tail
    if (c.state === 'wake_stretch') {
      const stretch = Math.sin((c.timer / 3.5) * Math.PI); // Arched back
      ctx.strokeStyle = '#e67e22';
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-7, -7 - stretch * 3);
      ctx.quadraticCurveTo(-11, -15 + Math.sin(time * 10) * 4, -8, -19);
      ctx.stroke();

      // Arched torso
      ctx.fillStyle = '#ff9f43';
      ctx.beginPath();
      ctx.ellipse(0, -6 - stretch * 2.5, 8, 4.5, -stretch * 0.25, 0, Math.PI * 2);
      ctx.fill();

      // Extended legs
      ctx.strokeStyle = '#ffbe76';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(-5, -5); ctx.lineTo(-7, 0);
      ctx.moveTo(5, -4); ctx.lineTo(9, 0);
      ctx.stroke();

      // Lowered head during stretch
      ctx.fillStyle = '#ff9f43';
      ctx.beginPath();
      ctx.arc(8, -7 + stretch * 2, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(5, -10 + stretch * 2); ctx.lineTo(6, -14 + stretch * 2); ctx.lineTo(8, -10.5 + stretch * 2);
      ctx.moveTo(9, -10.5 + stretch * 2); ctx.lineTo(11, -14 + stretch * 2); ctx.lineTo(12, -9.5 + stretch * 2);
      ctx.fill();

      ctx.restore();
      return;
    }

    // 4. Standard states: sitting, walking, spinning, and chasing butterfly
    const tailSpeed = (c.state === 'chase_butterfly' || c.state === 'spin') ? 11 : (isWalking ? 6 : 2.5);
    const tailSway = Math.sin(time * tailSpeed) * 4.5;
    ctx.strokeStyle = '#e67e22';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (isWalking || c.state === 'chase_butterfly') {
      ctx.moveTo(-7, -7 - bob);
      ctx.quadraticCurveTo(-13, -12 + tailSway * 0.6, -11, -17);
    } else {
      ctx.moveTo(-5, -3);
      ctx.quadraticCurveTo(-12, -4 + tailSway * 0.5, -10, -11);
    }
    ctx.stroke();

    ctx.fillStyle = '#ff9f43';
    if (isWalking || c.state === 'chase_butterfly') {
      ctx.beginPath();
      ctx.roundRect(-8, -11 - bob, 15, 7, 3.5);
      ctx.fill();

      const leg1 = isWalking ? Math.sin(c.walkPhase) * 3 : (c.jumpY < 0 ? 3 : 0);
      const leg2 = isWalking ? -Math.sin(c.walkPhase) * 3 : (c.jumpY < 0 ? -3 : 0);
      ctx.strokeStyle = '#d35400';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(-5, -5 - bob); ctx.lineTo(-5 + leg1, 0);
      ctx.moveTo(4, -5 - bob); ctx.lineTo(4 + leg2, 0);
      ctx.stroke();

      ctx.strokeStyle = '#ff9f43';
      ctx.beginPath();
      ctx.moveTo(-3, -5 - bob); ctx.lineTo(-3 + leg2, 0);
      ctx.moveTo(6, -5 - bob); ctx.lineTo(6 + leg1, 0);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.ellipse(-1, -6, 6.5, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffbe76';
      ctx.beginPath();
      ctx.roundRect(2, -3, 4, 3, 1.5);
      ctx.fill();
    }

    const headX = (isWalking || c.state === 'chase_butterfly') ? 7 : 3;
    const headY = (isWalking || c.state === 'chase_butterfly') ? -12 - bob : -13 + Math.sin(time * 2) * 0.4;

    ctx.fillStyle = '#ff9f43';
    ctx.beginPath();
    ctx.arc(headX, headY, 5, 0, Math.PI * 2);
    ctx.fill();

    // Ears
    ctx.beginPath();
    ctx.moveTo(headX - 3.5, headY - 3);
    ctx.lineTo(headX - 2, headY - 7.5);
    ctx.lineTo(headX, headY - 4);
    ctx.moveTo(headX + 1, headY - 4);
    ctx.lineTo(headX + 3, headY - 7.5);
    ctx.lineTo(headX + 4, headY - 2.5);
    ctx.fill();

    // Eye (alert when playing/walking, drowsy/closed when sitting by the fire)
    ctx.strokeStyle = '#2d1600';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    if (isWalking || c.state === 'chase_butterfly' || c.state === 'spin') {
      ctx.arc(headX + 2.2, headY - 0.5, 1.05, 0, Math.PI * 2);
      ctx.fillStyle = '#2d1600';
      ctx.fill();
    } else {
      ctx.moveTo(headX + 1, headY - 0.5);
      ctx.quadraticCurveTo(headX + 2.5, headY + 1, headX + 4, headY - 0.5);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawPerson(x, groundY, time) {
    ctx.save();
    ctx.translate(x, groundY);

    const breathe = Math.sin(time * 2) * 0.6;
    const stirArm = Math.sin(time * 2.6) * 2.2;

    // Tree log seat
    ctx.fillStyle = '#3b281c';
    ctx.beginPath();
    ctx.roundRect(-10, -8, 18, 8, 3);
    ctx.fill();
    ctx.fillStyle = '#5c4030';
    ctx.beginPath();
    ctx.arc(-10, -4, 3.8, 0, Math.PI * 2);
    ctx.fill();

    // Legs
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-2, -8);
    ctx.lineTo(-10, -5);
    ctx.lineTo(-12, -1);
    ctx.stroke();

    // Torso
    ctx.fillStyle = '#2c3e50';
    ctx.beginPath();
    ctx.roundRect(-7, -25 + breathe, 13, 18, 5);
    ctx.fill();

    // Warm orange scarf
    ctx.fillStyle = '#e67e22';
    ctx.beginPath();
    ctx.roundRect(-6, -26 + breathe, 11, 4, 2);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(-1, -24 + breathe, 3.5, 9, 1.5);
    ctx.fill();

    // Head
    ctx.fillStyle = '#e0a98f';
    ctx.beginPath();
    ctx.arc(-1, -30 + breathe, 4.8, 0, Math.PI * 2);
    ctx.fill();

    // Winter beanie
    ctx.fillStyle = '#c0392b';
    ctx.beginPath();
    ctx.arc(-1, -31.5 + breathe, 5, Math.PI, 0);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, -37 + breathe, 2, 0, Math.PI * 2);
    ctx.fill();

    // Arm and wooden spoon stirring the pot
    ctx.strokeStyle = '#34495e';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-4, -21 + breathe);
    ctx.lineTo(-14, -16 + stirArm * 0.4);
    ctx.stroke();

    ctx.strokeStyle = '#a06a42';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-14, -16 + stirArm * 0.4);
    ctx.lineTo(-24, -11 + stirArm * 0.6);
    ctx.stroke();

    // Cold breath vapor
    const breathCycle = (time * 0.5) % 1;
    if (breathCycle < 0.6) {
      ctx.fillStyle = `rgba(226, 232, 240, ${(0.6 - breathCycle) * 0.3})`;
      ctx.beginPath();
      ctx.arc(-7 - breathCycle * 10, -29 - breathCycle * 5, 1.5 + breathCycle * 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawCampfireAndPot(fireX, groundY, time) {
    const flicker = Math.sin(time * 10) * 2.5 + Math.cos(time * 6) * 2;
    const glowRadius = 58 + flicker;
    const grad = ctx.createRadialGradient(fireX, groundY - 8, 2, fireX, groundY - 8, glowRadius);
    grad.addColorStop(0, 'rgba(255, 159, 67, 0.32)');
    grad.addColorStop(0.5, 'rgba(230, 126, 34, 0.10)');
    grad.addColorStop(1, 'rgba(255, 159, 67, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(fireX, groundY - 8, glowRadius, 0, Math.PI * 2);
    ctx.fill();

    // Firewood logs
    ctx.strokeStyle = '#4a2e1b';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(fireX - 9, groundY - 1); ctx.lineTo(fireX + 8, groundY - 5);
    ctx.moveTo(fireX + 9, groundY - 1); ctx.lineTo(fireX - 8, groundY - 5);
    ctx.stroke();

    // Outer orange flame
    const f1 = Math.sin(time * 9) * 2;
    const f2 = Math.cos(time * 12) * 1.5;
    ctx.fillStyle = '#ff793f';
    ctx.beginPath();
    ctx.moveTo(fireX - 7, groundY - 3);
    ctx.quadraticCurveTo(fireX - 8, groundY - 13, fireX + f1, groundY - 20 + f2);
    ctx.quadraticCurveTo(fireX + 8, groundY - 13, fireX + 7, groundY - 3);
    ctx.closePath();
    ctx.fill();

    // Inner warm yellow flame
    ctx.fillStyle = '#ffda79';
    ctx.beginPath();
    ctx.moveTo(fireX - 4, groundY - 3);
    ctx.quadraticCurveTo(fireX - 4, groundY - 10, fireX - f2, groundY - 14 + f1 * 0.5);
    ctx.quadraticCurveTo(fireX + 4, groundY - 10, fireX + 4, groundY - 3);
    ctx.closePath();
    ctx.fill();

    // Cooking pot tripod
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(fireX - 11, groundY);
    ctx.lineTo(fireX, groundY - 25);
    ctx.lineTo(fireX + 11, groundY);
    ctx.stroke();

    // Hanging cooking pot
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.roundRect(fireX - 6, groundY - 19, 12, 7, 2);
    ctx.fill();
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1;
    ctx.strokeRect(fireX - 6, groundY - 19, 12, 7);

    // Rising steam from the pot
    steams.forEach((s) => {
      const p = (time * 0.4 + s.offset) % 1;
      const sx = fireX + Math.sin(p * 6 + s.offset * 5) * 3;
      const sy = (groundY - 21) - p * 18;
      ctx.fillStyle = `rgba(255, 255, 255, ${(1 - p) * 0.25})`;
      ctx.beginPath();
      ctx.arc(sx, sy, 1.5 + p * 2.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // Rising fire embers
    embers.forEach((e) => {
      if (e.life <= 0) {
        e.x = fireX + (Math.random() - 0.5) * 8;
        e.y = groundY - 12;
        e.vy = -(Math.random() * 0.35 + 0.15);
        e.vx = (Math.random() - 0.5) * 0.25;
        e.maxLife = Math.random() * 60 + 40;
        e.life = e.maxLife;
      }
      e.x += e.vx + Math.sin(time * 4 + e.y * 0.1) * 0.12;
      e.y += e.vy;
      e.life--;
      ctx.fillStyle = `rgba(255, 190, 118, ${e.life / e.maxLife})`;
      ctx.fillRect(e.x, e.y, 1.5, 1.5);
    });
  }

  function updateScenario(fireX, personX, groundY) {
    cat.homeX = personX + 18;
    cat.playX = Math.max(45, fireX - 68);

    if (cat.x === 0) cat.x = cat.homeX;

    const dt = 1 / 60;
    cat.timer += dt;

    // 1. Sit warmly next to the person and campfire (6 seconds)
    if (cat.state === 'sit_by_man') {
      cat.dir = -1;
      if (cat.timer > 6) {
        cat.state = 'walk_out';
        cat.timer = 0;
      }
    }
    // 2. Walk out toward the snowy left side
    else if (cat.state === 'walk_out') {
      cat.dir = -1;
      cat.x -= 0.42;
      cat.walkPhase += 0.14;
      if (cat.x <= cat.playX) {
        cat.state = 'spin';
        cat.timer = 0;
      }
    }
    // 3. Spin around playfully (3.2 seconds)
    else if (cat.state === 'spin') {
      if (cat.timer > 3.2) {
        cat.state = 'roll';
        cat.timer = 0;
        cat.dir = -1;
      }
    }
    // 4. Lie down, rub in the snow, and wag tail (4.5 seconds)
    else if (cat.state === 'roll') {
      if (cat.timer > 4.5) {
        cat.state = 'chase_butterfly';
        cat.timer = 0;
        cat.jumpsDone = 0;
        // Spawn butterfly in front of the cat
        butterfly.active = true;
        butterfly.leaving = false;
        butterfly.x = cat.x - 16;
        butterfly.baseY = groundY - 22;
        butterfly.y = butterfly.baseY;
        butterfly.timer = 0;
      }
    }
    // 5. Spot flying butterfly and jump to catch it
    else if (cat.state === 'chase_butterfly') {
      butterfly.timer += dt;

      if (!butterfly.leaving) {
        // Butterfly flutters back and forth
        butterfly.x = cat.x - 14 + Math.sin(butterfly.timer * 2.5) * 14;
        butterfly.y = butterfly.baseY + Math.cos(butterfly.timer * 4) * 5;
        cat.dir = butterfly.x < cat.x ? -1 : 1;

        // Cat jump physics
        if (cat.jumpY === 0 && cat.jumpsDone < 3 && Math.floor(butterfly.timer * 1.1) > cat.jumpsDone) {
          cat.jumpVy = -3.4;
          cat.jumpsDone++;
        }
      } else {
        // Butterfly flies upward and disappears
        butterfly.y -= 0.55;
        butterfly.x -= 0.3;
        if (butterfly.y < -10) {
          butterfly.active = false;
        }
      }

      // Apply gravity to cat jump
      if (cat.jumpY < 0 || cat.jumpVy < 0) {
        cat.jumpY += cat.jumpVy;
        cat.jumpVy += 0.22;
        if (cat.jumpY >= 0) {
          cat.jumpY = 0;
          cat.jumpVy = 0;
        }
      }

      if (butterfly.timer > 5.5 && !butterfly.leaving) {
        butterfly.leaving = true;
      }

      if (butterfly.timer > 7.5) {
        butterfly.active = false;
        cat.jumpY = 0;
        cat.state = 'nap';
        cat.timer = 0;
      }
    }
    // 6. Lie down and take a nap (25 seconds)
    else if (cat.state === 'nap') {
      if (cat.timer > 25) {
        cat.state = 'wake_stretch';
        cat.timer = 0;
      }
    }
    // 7. Wake up, stretch, and wag tail (3.5 seconds)
    else if (cat.state === 'wake_stretch') {
      cat.dir = 1;
      if (cat.timer > 3.5) {
        cat.state = 'walk_back';
        cat.timer = 0;
      }
    }
    // 8. Walk back to the person sitting by the campfire
    else if (cat.state === 'walk_back') {
      cat.dir = 1;
      cat.x += 0.45;
      cat.walkPhase += 0.14;
      if (cat.x >= cat.homeX) {
        cat.x = cat.homeX;
        cat.state = 'sit_by_man';
        cat.timer = 0;
      }
    }
  }

  function render() {
    t += 0.016;
    const groundY = H - 14;

    // 1. Winter night sky
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#090d16');
    sky.addColorStop(1, '#131926');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // Crescent moon
    ctx.fillStyle = 'rgba(241, 245, 249, 0.85)';
    ctx.beginPath();
    ctx.arc(34, 22, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0b101b';
    ctx.beginPath();
    ctx.arc(37, 20, 6.2, 0, Math.PI * 2);
    ctx.fill();

    // 2. Background pine trees
    drawPineTree(55, groundY, 0.85, '#111927');
    drawPineTree(85, groundY, 1.05, '#152030');
    drawPineTree(W - 35, groundY, 0.9, '#111927');

    // 3. Snow ground
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(0, groundY, W, H - groundY);
    ctx.fillStyle = '#f1f5f9';
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.quadraticCurveTo(W * 0.35, groundY - 2, W * 0.7, groundY + 1);
    ctx.lineTo(W, groundY - 1);
    ctx.lineTo(W, groundY + 4);
    ctx.lineTo(0, groundY + 4);
    ctx.closePath();
    ctx.fill();

    const fireX = W - 92;
    const personX = W - 58;

    // 4. Campfire, cooking pot, and sitting person
    drawCampfireAndPot(fireX, groundY, t);
    drawPerson(personX, groundY, t);

    // 5. Update and draw cat and butterfly
    updateScenario(fireX, personX, groundY);
    drawButterfly(butterfly, t);
    drawCat(cat, groundY, t);

    // 6. Slow falling snowflakes
    snowflakes.forEach((s) => {
      s.y += s.vy;
      s.x += s.vx + Math.sin(t * 0.6 + s.y * 0.04) * 0.06;
      if (s.y > groundY) {
        s.y = -3;
        s.x = Math.random() * W;
      }
      if (s.x > W) s.x = 0;
      if (s.x < 0) s.x = W;

      ctx.fillStyle = `rgba(255, 255, 255, ${s.alpha})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    });

    requestAnimationFrame(render);
  }

  render();
})();
