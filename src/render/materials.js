// Shared lighting uniforms + ShaderMaterials (voxel world, water, generic textured objects, sky, additive glow).
import * as THREE from 'three';

export const MAX_DYN = 6;
// Global lighting state; every material references these uniform objects, so one update per frame is enough.
export const G = {
  uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3).normalize() },
  uSunCol: { value: new THREE.Color(1.6, 1.4, 1.1) },
  uSkyCol: { value: new THREE.Color(0.55, 0.7, 1.0) },
  uAmbCol: { value: new THREE.Color(0.1, 0.1, 0.12) },
  uWarmCol: { value: new THREE.Color(1.3, 0.8, 0.4) },
  uCoolCol: { value: new THREE.Color(0.2, 0.9, 1.0) },
  uFogCol: { value: new THREE.Color(0.6, 0.75, 0.95) },
  uFogDens: { value: 0.003 },
  uFogHeight: { value: new THREE.Vector2(0, 0) },  // x: reference Y, y: extra density per block below it
  uTime: { value: 0 },
  uDynPos: { value: Array.from({ length: MAX_DYN }, () => new THREE.Vector3(0, -9999, 0)) },
  uDynCol: { value: Array.from({ length: MAX_DYN }, () => new THREE.Color(0, 0, 0)) },
  uDynR: { value: new Float32Array(MAX_DYN).fill(1) },
  uObjSky: { value: 1 }, uObjSun: { value: 1 },       // light applied to objects without baked light (character...)
  uWaterY: { value: -1000 }, uUnder: { value: 0 },
};

const COMMON_FRAG = /* glsl */`
uniform vec3 uSunDir, uSunCol, uSkyCol, uAmbCol, uWarmCol, uCoolCol, uFogCol;
uniform float uFogDens, uTime;
uniform vec2 uFogHeight;
uniform vec3 uDynPos[${MAX_DYN}]; uniform vec3 uDynCol[${MAX_DYN}]; uniform float uDynR[${MAX_DYN}];
vec3 dynLight(vec3 P, vec3 N){
  vec3 acc = vec3(0.0);
  for(int i=0;i<${MAX_DYN};i++){
    vec3 d = uDynPos[i]-P; float L = length(d); float a = clamp(1.0-L/uDynR[i],0.0,1.0);
    float k = a*a*(0.45+0.55*max(dot(N,d/max(L,0.001)),0.0));
    acc += uDynCol[i]*k;
  }
  return acc;
}
vec3 applyFog(vec3 c, vec3 P){
  float d = distance(P, cameraPosition);
  float dens = uFogDens;
  float below = max(uFogHeight.x - 0.5*(P.y+cameraPosition.y), 0.0);
  dens += uFogHeight.y * min(below, 120.0);
  float f = 1.0 - exp(-d*dens - d*d*dens*dens*0.35);
  return mix(c, uFogCol, clamp(f,0.0,1.0));
}
`;

// ---------------- voxel world (opaque cutout) ----------------
export function makeVoxelMaterial(atlasTex) {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: atlasTex }, ...G },
    vertexShader: /* glsl */`
      attribute vec4 aL; attribute vec2 aA;
      varying vec2 vUv; varying vec4 vL; varying vec2 vA; varying vec3 vN; varying vec3 vP;
      void main(){ vUv=uv; vL=aL; vA=aA; vN=normal; vec4 wp=modelMatrix*vec4(position,1.0); vP=wp.xyz; gl_Position=projectionMatrix*viewMatrix*wp; }`,
    fragmentShader: /* glsl */`
      uniform sampler2D map; varying vec2 vUv; varying vec4 vL; varying vec2 vA; varying vec3 vN; varying vec3 vP;
      ${COMMON_FRAG}
      void main(){
        vec4 t = texture2D(map, vUv); if(t.a<0.5) discard;
        vec3 N = normalize(vN);
        float ao = mix(0.42, 1.0, vA.x);
        float skyN = 0.55 + 0.45*N.y;
        vec3 light = uAmbCol*(0.7+0.3*ao) + vL.x*skyN*uSkyCol*ao + vL.y*max(dot(N,uSunDir),0.0)*uSunCol*mix(0.75,1.0,ao)
                   + (vL.z*uWarmCol + vL.w*uCoolCol)*ao + dynLight(vP,N);
        vec3 col = t.rgb*light;
        col += t.rgb*vA.y*1.15;                 // self-lit blocks (lamps, bulbs)
        gl_FragColor = vec4(applyFog(col, vP), 1.0);
      }`
  });
}

// ---------------- water (transparent) ----------------
export function makeWaterMaterial(atlasTex) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { map: { value: atlasTex }, ...G },
    vertexShader: /* glsl */`
      attribute vec4 aL; varying vec2 vUv; varying vec4 vL; varying vec3 vN; varying vec3 vP;
      void main(){ vUv=uv; vL=aL; vN=normal; vec4 wp=modelMatrix*vec4(position,1.0); vP=wp.xyz; gl_Position=projectionMatrix*viewMatrix*wp; }`,
    fragmentShader: /* glsl */`
      uniform sampler2D map; uniform float uUnder; varying vec2 vUv; varying vec4 vL; varying vec3 vN; varying vec3 vP;
      ${COMMON_FRAG}
      float h21(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y); }
      void main(){
        vec2 q = vP.xz*0.35;
        float w = vn(q+vec2(uTime*0.35,uTime*0.2))*0.6 + vn(q*2.3-vec2(uTime*0.5,uTime*0.3))*0.4;
        vec2 uv2 = vUv + (w-0.5)*0.01;
        vec4 t = texture2D(map, uv2);
        vec3 N = normalize(vN + vec3((w-0.5)*0.5,0.0,(vn(q*1.7+3.0)-0.5)*0.5));
        vec3 V = normalize(cameraPosition - vP);
        vec3 light = uAmbCol*1.4 + vL.x*uSkyCol*0.9 + vL.y*uSunCol*0.55 + vL.z*uWarmCol + vL.w*uCoolCol + dynLight(vP,N);
        vec3 col = t.rgb*light*0.85;
        float fres = pow(1.0-clamp(abs(dot(N,V)),0.0,1.0), 3.0);
        vec3 R = reflect(-V, N);
        float glint = pow(max(dot(R,uSunDir),0.0), 90.0)*vL.y*step(0.5,N.y);
        col += uSkyCol*fres*0.45*(0.3+vL.x) + uSunCol*glint*1.4;
        float a = clamp(0.62 + fres*0.25, 0.0, 0.92);
        gl_FragColor = vec4(applyFog(col, vP), a);
      }`
  });
}

// ---------------- generic textured object (character, elytra, GLB, portal frame) ----------------
export function makeObjectMaterial(map, opts = {}) {
  const { alphaTest = 0.5, emissive = 0, bakedLight = false, side = THREE.FrontSide, transparent = false, tint = null, rim = 0 } = opts;
  return new THREE.ShaderMaterial({
    side, transparent, depthWrite: !transparent,
    defines: { BAKED: bakedLight ? 1 : 0 },
    uniforms: { map: { value: map }, uAlphaTest: { value: alphaTest }, uEmissive: { value: emissive }, uTint: { value: tint ? new THREE.Color(tint) : new THREE.Color(1, 1, 1) }, uRim: { value: rim },
      uObjSky: G.uObjSky, uObjSun: G.uObjSun, ...G },
    vertexShader: /* glsl */`
      #if BAKED
      attribute vec4 aL;
      #endif
      varying vec2 vUv; varying vec3 vN; varying vec3 vP; varying vec4 vL;
      void main(){
        vUv=uv; vec4 wp = modelMatrix*vec4(position,1.0); vP=wp.xyz; vN=normalize(mat3(modelMatrix)*normal);
        #if BAKED
        vL=aL;
        #else
        vL=vec4(0.0);
        #endif
        gl_Position=projectionMatrix*viewMatrix*wp; }`,
    fragmentShader: /* glsl */`
      uniform sampler2D map; uniform float uAlphaTest, uEmissive, uObjSky, uObjSun, uRim; uniform vec3 uTint;
      varying vec2 vUv; varying vec3 vN; varying vec3 vP; varying vec4 vL;
      ${COMMON_FRAG}
      void main(){
        vec4 t = texture2D(map, vUv); if(t.a<uAlphaTest) discard;
        vec3 N = normalize(gl_FrontFacing ? vN : -vN);
        #if BAKED
        vec4 L = vL;
        #else
        vec4 L = vec4(uObjSky, uObjSun, 0.0, 0.0);
        #endif
        float skyN = 0.55+0.45*N.y;
        vec3 light = uAmbCol*1.0 + L.x*skyN*uSkyCol + L.y*max(dot(N,uSunDir),0.0)*uSunCol + L.z*uWarmCol + L.w*uCoolCol + dynLight(vP,N);
        vec3 col = t.rgb*uTint*light;
        col += t.rgb*uTint*uEmissive;
        vec3 V = normalize(cameraPosition-vP);
        col += uRim*pow(1.0-max(dot(N,V),0.0),3.0)*uSkyCol*0.5;
        gl_FragColor = vec4(applyFog(col, vP), t.a);
      }`
  });
}

// ---------------- sky dome ----------------
export function makeSkyMaterial(U) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false,
    uniforms: { uZenith: { value: new THREE.Color(0.2, 0.4, 0.9) }, uHorizon: { value: new THREE.Color(0.7, 0.8, 1.0) }, uSunDir: G.uSunDir, uSunCol: G.uSunCol, uSunGlow: { value: 1 }, uSunSize: { value: 1 }, ...U },
    vertexShader: `varying vec3 vD; void main(){ vD=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position.z=gl_Position.w; }`,
    fragmentShader: /* glsl */`
      uniform vec3 uZenith,uHorizon,uSunDir,uSunCol; uniform float uSunGlow,uSunSize; varying vec3 vD;
      void main(){
        vec3 d=normalize(vD); float h=clamp(d.y,-0.2,1.0);
        float t=pow(clamp(h,0.0,1.0),0.55);
        vec3 col=mix(uHorizon,uZenith,t);
        float s=max(dot(d,normalize(uSunDir)),0.0);
        float disc=smoothstep(0.9993-0.0004*uSunSize,0.9996,s);
        col+= uSunCol*(pow(s,12.0)*0.22+pow(s,160.0)*0.9)*uSunGlow;
        col = mix(col, uSunCol*3.0, disc*step(0.0,d.y+0.02));
        col = mix(col, uHorizon*0.9, smoothstep(0.0,-0.18,d.y));   // below horizon: haze
        gl_FragColor=vec4(col,1.0);
      }`
  });
}

// ---------------- additive soft sprite / beam material ----------------
export function makeGlowMaterial(color = 0xffffff, opacity = 1) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uCol: { value: new THREE.Color(color) }, uOp: { value: opacity }, uFogCol: G.uFogCol, uFogDens: G.uFogDens, uTime: G.uTime },
    vertexShader: `varying vec2 vUv; varying vec3 vP; void main(){ vUv=uv; vec4 wp=modelMatrix*vec4(position,1.0); vP=wp.xyz; gl_Position=projectionMatrix*viewMatrix*wp; }`,
    fragmentShader: `uniform vec3 uCol; uniform float uOp; varying vec2 vUv; varying vec3 vP; void main(){ float r=length(vUv-0.5)*2.0; float a=pow(clamp(1.0-r,0.0,1.0),2.0); gl_FragColor=vec4(uCol*a*uOp,1.0); }`
  });
}
