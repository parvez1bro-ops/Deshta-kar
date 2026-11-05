/**
 * Procedural surface detail for the instanced city materials (no texture files, no extra draw calls).
 *
 * The city is built from unit boxes / cylinders / prisms scaled per instance, so image textures would stretch.
 * Instead the Lambert shader is patched to add, from the WORLD position of each pixel:
 *   - soft plaster / concrete mottling (2 noise octaves; the fine octave fades out with distance),
 *   - dirt and damp darkening at the foot of walls,
 *   - asphalt grain on roads and paving-slab joints on sidewalks,
 *   - corrugated tin ribbing + sheet-to-sheet tone changes on gable roofs (roof pool only).
 * Cost: one varying set + ~4 cheap hash lookups per pixel, no texture fetches. The patch is applied once per
 * material at creation time, so nothing is allocated per frame.
 */

const VERT_DECL = /* glsl */ `
varying vec3 vWPos;
varying vec3 vWNrm;
varying vec3 vLocal;
`;

const VERT_BODY = /* glsl */ `
{
  vec4 dp = vec4(transformed, 1.0);
  vec3 dn = objectNormal;
  vec3 sc = vec3(1.0);
  #ifdef USE_INSTANCING
    dp = instanceMatrix * dp;
    dn = mat3(instanceMatrix) * dn;
    sc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
  #endif
  vLocal = transformed * sc;
  vWPos = (modelMatrix * dp).xyz;
  vWNrm = normalize(mat3(modelMatrix) * dn);
}
`;

const FRAG_DECL = /* glsl */ `
varying vec3 vWPos;
varying vec3 vWNrm;
varying vec3 vLocal;
float dtHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float dtNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(dtHash(i), dtHash(i + vec2(1.0, 0.0)), f.x),
             mix(dtHash(i + vec2(0.0, 1.0)), dtHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
`;

const FRAG_BODY = /* glsl */ `
{
  vec3 an = abs(vWNrm);
  bool isTop = an.y > 0.7;
  float dist = length(vWPos - cameraPosition);
  float lod = 1.0 - smoothstep(28.0, 65.0, dist);          // fine detail fades out before it can shimmer
  vec2 q = isTop ? vWPos.xz : (an.x > an.z ? vWPos.zy : vWPos.xy);
  float n1 = dtNoise(q * 1.3);
  float n2 = dtNoise(q * 6.5);
  float shade = 1.0 + (n1 - 0.5) * 0.09 + (n2 - 0.5) * 0.09 * lod;

  if (!isTop) {
    // dirt / damp rising from the ground, plus a faint darker band under each storey line
    shade *= mix(0.74, 1.0, smoothstep(0.0, 1.7, vWPos.y + (n1 - 0.5) * 0.5));
  } else if (vWPos.y < 0.3) {
    // road, sidewalk, plaza: asphalt grain
    shade *= 1.0 + (n2 - 0.5) * 0.2 * lod + (dtNoise(q * 0.35) - 0.5) * 0.1;
    if (vWPos.y > 0.12 && vWPos.y < 0.2) {                 // sidewalk: paving slabs 1.2 m
      vec2 g = abs(fract(vWPos.xz / 1.2) - 0.5);
      shade *= 1.0 - 0.17 * smoothstep(0.465, 0.495, max(g.x, g.y)) * lod;
    }
  }

  #ifdef DT_ROOF
    // corrugated tin: ribs run down the slope (ridge is local z), each 0.9 m sheet has its own tone
    if (!isTop || an.y < 0.99) {
      float sheet = dtHash(vec2(floor(vLocal.z / 0.9), 3.0));
      shade *= 0.93 + sheet * 0.14;
      shade *= 1.0 + 0.075 * sin(vLocal.z * 34.0) * lod;
    }
  #endif
  diffuseColor.rgb *= shade;
}
`;

/** Patch a MeshLambertMaterial (instanced). Call once per material. */
export function applySurfaceDetail(material, { roof = false } = {}) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_DECL)
      .replace('#include <project_vertex>', '#include <project_vertex>\n' + VERT_BODY);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_DECL)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + FRAG_BODY);
    if (roof) shader.fragmentShader = '#define DT_ROOF\n' + shader.fragmentShader;
  };
  material.customProgramCacheKey = () => (roof ? 'dt-detail-roof' : 'dt-detail');
  return material;
}

/**
 * Large-scale colour variation for the ground plane: lush / dry / bare-earth blotches so the repeating grass tile
 * is not obvious. Plain meshes only (not instanced); one noise pair per pixel.
 */
export function applyGroundVariation(material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\n' + FRAG_DECL.split('\n').filter((l) => !l.startsWith('varying')).join('\n'))
      .replace('#include <map_fragment>', `#include <map_fragment>
      {
        float big = dtNoise(vWPos.xz * 0.04);
        float mid = dtNoise(vWPos.xz * 0.19 + 7.0);
        vec3 lush = vec3(0.90, 1.0, 0.88);
        vec3 dry = vec3(1.10, 0.97, 0.70);
        vec3 tint = mix(lush, dry, smoothstep(0.5, 0.78, big));
        diffuseColor.rgb *= tint * (0.92 + 0.14 * mid);
      }`);
  };
  material.customProgramCacheKey = () => 'dt-ground';
  return material;
}
