
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

/**
 * Extracts a complete HTML document from a string that might contain
 * conversational text, markdown code blocks, etc.
 */
export const extractHtmlFromText = (text: string): string => {
  if (!text) return "";

  // 1. Try to find a complete HTML document structure (most reliable)
  const htmlMatch = text.match(/(<!DOCTYPE html>|<html)[\s\S]*?<\/html>/i);
  if (htmlMatch) {
    return htmlMatch[0];
  }

  // 2. Fallback: Try to extract content from markdown code blocks
  const codeBlockMatch = text.match(/```(?:html)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  return text.trim();
};

/**
 * Injects CSS into the HTML to hide common text elements.
 */
export const hideBodyText = (html: string): string => {
  const cssToInject = `
    <style>
      #info, #loading, #ui, #instructions, .label, .overlay, #description {
        display: none !important;
        opacity: 0 !important;
        pointer-events: none !important;
        visibility: hidden !important;
      }
      body {
        user-select: none !important;
      }
    </style>
  `;

  if (html.toLowerCase().includes('</head>')) {
    return html.replace(/<\/head>/i, `${cssToInject}</head>`);
  }
  if (html.toLowerCase().includes('</body>')) {
    return html.replace(/<\/body>/i, `${cssToInject}</body>`);
  }
  return html + cssToInject;
};

/**
 * Zooms the camera in by modifying camera.position.set calls.
 */
export const zoomCamera = (html: string, zoomFactor: number = 0.8): string => {
  const regex = /camera\.position\.set\(\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)\s*\)/g;
  return html.replace(regex, (match, x, y, z) => {
    const newX = parseFloat(x) * zoomFactor;
    const newY = parseFloat(y) * zoomFactor;
    const newZ = parseFloat(z) * zoomFactor;
    return `camera.position.set(${newX}, ${newY}, ${newZ})`;
  });
};

/**
 * Injects a 3rd person character controller and 3D Export utility.
 * Improved to poll for variables and handle dynamic module loading for the exporter.
 */
export const injectGameMode = (html: string): string => {
    const gameScript = `
    // --- INJECTED GAME & EXPORT LOGIC ---
    (function() {
        async function startInjectedLogic() {
            console.log("[Voxelize] Injected logic started. Waiting for Three.js variables...");
            
            // Poll for variables that might be defined in the parent module scope
            let THREE_obj, scene_obj, camera_obj, renderer_obj, controls_obj;
            
            const poll = async () => {
                for (let i = 0; i < 100; i++) {
                    try {
                        THREE_obj = typeof THREE !== 'undefined' ? THREE : null;
                        scene_obj = typeof scene !== 'undefined' ? scene : null;
                        camera_obj = typeof camera !== 'undefined' ? camera : null;
                        renderer_obj = typeof renderer !== 'undefined' ? renderer : null;
                        controls_obj = typeof controls !== 'undefined' ? controls : null;
                        
                        if (THREE_obj && scene_obj && renderer_obj) return true;
                    } catch(e) {}
                    await new Promise(r => setTimeout(r, 100));
                }
                return false;
            };

            const found = await poll();
            if (!found) {
                console.warn("[Voxelize] Could not find THREE or scene variables. Export may not work.");
                return;
            }

            console.log("[Voxelize] Three.js variables found. Ready for interactions.");

            // 1. Export Handler
            window.addEventListener('message', async (event) => {
                if (event.data === 'EXPORT_GLB') {
                    console.log("[Voxelize] Export command received.");
                    try {
                        // Attempt to load exporter from the import map or direct unpkg link
                        let GLTFExporter;
                        try {
                            const module = await import('three/addons/exporters/GLTFExporter.js');
                            GLTFExporter = module.GLTFExporter;
                        } catch (err) {
                            console.log("[Voxelize] Import map failed, trying direct unpkg link...");
                            const module = await import('https://unpkg.com/three@0.160.0/examples/jsm/exporters/GLTFExporter.js');
                            GLTFExporter = module.GLTFExporter;
                        }

                        if (!GLTFExporter) throw new Error("GLTFExporter not found in loaded modules");

                        const exporter = new GLTFExporter();
                        exporter.parse(scene_obj, (gltf) => {
                            const blob = gltf instanceof ArrayBuffer 
                                ? new Blob([gltf], { type: 'application/octet-stream' })
                                : new Blob([JSON.stringify(gltf)], { type: 'application/json' });
                            
                            const url = URL.createObjectURL(blob);
                            const link = document.createElement('a');
                            link.style.display = 'none';
                            link.href = url;
                            link.download = 'voxel-scene-' + Date.now() + (gltf instanceof ArrayBuffer ? '.glb' : '.gltf');
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                            URL.revokeObjectURL(url);
                            console.log("[Voxelize] Export successful.");
                        }, (error) => {
                            console.error('[Voxelize] Export error:', error);
                        }, { binary: true, includeCustomExtensions: true });
                    } catch (err) {
                        console.error("[Voxelize] Failed to export GLB:", err);
                    }
                }
            });

            // 2. Character Setup
            const dist = camera_obj.position.distanceTo(new THREE_obj.Vector3(0,0,0));
            const playerHeight = Math.max(1, dist / 25); 
            const playerRadius = playerHeight * 0.3;
            const moveSpeed = playerHeight * 15;
            const jumpForce = playerHeight * 15;
            const gravity = playerHeight * 40;

            const geometry = new THREE_obj.CylinderGeometry(playerRadius, playerRadius, playerHeight, 16);
            const material = new THREE_obj.MeshStandardMaterial({ color: 0xff0055, roughness: 0.4 });
            const player = new THREE_obj.Mesh(geometry, material);
            player.position.set(0, playerHeight * 5, 0); 
            scene_obj.add(player);
            
            const shadowGeo = new THREE_obj.CircleGeometry(playerRadius * 1.5, 16);
            const shadowMat = new THREE_obj.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false });
            const shadow = new THREE_obj.Mesh(shadowGeo, shadowMat);
            shadow.rotation.x = -Math.PI / 2;
            scene_obj.add(shadow);

            const input = { f: false, b: false, l: false, r: false, space: false };
            window.addEventListener('keydown', (e) => {
                const key = e.code;
                if (key === 'KeyW' || key === 'ArrowUp') input.f = true;
                if (key === 'KeyS' || key === 'ArrowDown') input.b = true;
                if (key === 'KeyA' || key === 'ArrowLeft') input.l = true;
                if (key === 'KeyD' || key === 'ArrowRight') input.r = true;
                if (key === 'Space') input.space = true;
            });
            window.addEventListener('keyup', (e) => {
                const key = e.code;
                if (key === 'KeyW' || key === 'ArrowUp') input.f = false;
                if (key === 'KeyS' || key === 'ArrowDown') input.b = false;
                if (key === 'KeyA' || key === 'ArrowLeft') input.l = false;
                if (key === 'KeyD' || key === 'ArrowRight') input.r = false;
                if (key === 'Space') input.space = false;
            });

            const velocity = new THREE_obj.Vector3();
            const raycaster = new THREE_obj.Raycaster();
            const down = new THREE_obj.Vector3(0, -1, 0);
            const clock = new THREE_obj.Clock();

            const originalRender = renderer_obj.render.bind(renderer_obj);
            
            renderer_obj.render = (s, c) => {
                const dt = Math.min(clock.getDelta(), 0.1); 
                velocity.y -= gravity * dt;

                const camDir = new THREE_obj.Vector3();
                camera_obj.getWorldDirection(camDir);
                camDir.y = 0;
                camDir.normalize();
                
                const camRight = new THREE_obj.Vector3();
                camRight.crossVectors(camDir, new THREE_obj.Vector3(0, 1, 0)).normalize();

                const moveDir = new THREE_obj.Vector3();
                if (input.f) moveDir.add(camDir);
                if (input.b) moveDir.sub(camDir);
                if (input.l) moveDir.sub(camRight);
                if (input.r) moveDir.add(camRight);

                if (moveDir.lengthSq() > 0) {
                    moveDir.normalize();
                    player.position.add(moveDir.multiplyScalar(moveSpeed * dt));
                }

                raycaster.set(player.position, down);
                const intersects = raycaster.intersectObjects(scene_obj.children, true);
                
                let groundY = -Infinity;
                for (let hit of intersects) {
                    if (hit.object !== player && hit.object !== shadow && !hit.object.userData.ignoreRaycast) {
                        groundY = hit.point.y;
                        break; 
                    }
                }

                const feetPos = player.position.y - playerHeight/2;
                if (feetPos <= groundY + 0.1) {
                    if (velocity.y <= 0) {
                        player.position.y = groundY + playerHeight/2;
                        velocity.y = 0;
                        if (input.space) velocity.y = jumpForce;
                    }
                }
                
                player.position.y += velocity.y * dt;

                if (groundY > -100) {
                    shadow.position.set(player.position.x, groundY + 0.05, player.position.z);
                    shadow.visible = true;
                } else {
                    shadow.visible = false;
                }

                if (player.position.y < -100) {
                    player.position.set(0, playerHeight * 10, 0);
                    velocity.set(0, 0, 0);
                }

                if (controls_obj) {
                    const targetPos = player.position.clone();
                    controls_obj.target.lerp(targetPos, 0.1);
                    controls_obj.update();
                } else {
                    camera_obj.lookAt(player.position);
                }

                originalRender(s, c);
            };
        }
        
        // Use requestAnimationFrame to ensure the rest of the script has a chance to initialize variables
        requestAnimationFrame(() => {
            startInjectedLogic().catch(console.error);
        });
    })();
    `;

    const lastScriptTag = /<\/script>(?![\s\S]*<\/script>)/i;
    const match = html.match(lastScriptTag);
    if (!match) return html + `<script type="module">${gameScript}</script>`;
    
    // Inject just before the end of the last script tag to share scope if it's a module
    return html.replace(lastScriptTag, `\n${gameScript}\n</script>`);
};
