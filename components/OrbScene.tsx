"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Sparkles } from "@react-three/drei";
import * as THREE from "three";
import { useMemo, useRef } from "react";

/**
 * The hero object is a deforming UV sphere rather than a static primitive.
 * Vertex displacement is driven by coherent sine fields, so neighboring
 * vertices move together and the silhouette remains mathematically smooth.
 * Cursor coordinates are normalized to [-1,1] and used as a low-frequency
 * target for the light/camera system, avoiding frame-rate-dependent jumps.
 */
function Core() {
  const mesh = useRef<THREE.Mesh>(null);
  const material = useRef<THREE.ShaderMaterial>(null);
  const target = useRef(new THREE.Vector2());

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uPointer: { value: new THREE.Vector2() }
  }), []);

  useFrame(({ clock, pointer }) => {
    const t = clock.getElapsedTime();
    target.current.lerp(pointer, 0.035);
    uniforms.uTime.value = t;
    uniforms.uPointer.value.lerp(target.current, 0.08);
    if (mesh.current) {
      mesh.current.rotation.y = THREE.MathUtils.lerp(mesh.current.rotation.y, t * .12 + pointer.x * .12, .035);
      mesh.current.rotation.x = THREE.MathUtils.lerp(mesh.current.rotation.x, pointer.y * .08, .035);
    }
  });

  return (
    <mesh ref={mesh} scale={1.0}>
      <icosahedronGeometry args={[1, 64]} />
      <shaderMaterial ref={material} uniforms={uniforms} vertexShader={`
        uniform float uTime;
        varying vec3 vNormal;
        varying float vWave;
        void main() {
          vec3 p = position;
          float wave = sin(p.x*5.2 + uTime*1.2) * 0.035
                     + sin(p.y*7.1 - uTime*.8) * 0.025
                     + sin(p.z*6.4 + uTime*.65) * 0.03;
          p += normal * wave;
          vWave = wave;
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `} fragmentShader={`
        uniform float uTime;
        uniform vec2 uPointer;
        varying vec3 vNormal;
        varying float vWave;
        void main() {
          vec3 lightA = normalize(vec3(-.6, .8, 1.0));
          vec3 lightB = normalize(vec3(.8, -.25, .5));
          float a = pow(max(dot(vNormal, lightA), 0.0), 1.7);
          float b = pow(max(dot(vNormal, lightB), 0.0), 2.4);
          float rim = pow(1.0 - max(dot(vNormal, vec3(0,0,1)),0.0), 2.8);
          vec3 base = mix(vec3(.035,.04,.055), vec3(.18,.2,.28), a);
          base += vec3(.18,.22,.34) * b + vec3(.08,.18,.3) * rim;
          base += .025 * sin(uTime*2.0 + vWave*80.0);
          gl_FragColor = vec4(base, .96);
        }
      `} transparent />
    </mesh>
  );
}

export default function OrbScene() {
  return (
    <div className="absolute inset-0">
      <Canvas camera={{ position: [0, 0, 6.5], fov: 42 }} dpr={[1, 2]}>
        <ambientLight intensity={0.35} />
        <pointLight position={[3, 3, 4]} intensity={8} distance={12} />
        <pointLight position={[-4, -2, 2]} intensity={5} distance={10} />
        <Float speed={1.2} rotationIntensity={.18} floatIntensity={.35}>
          <Core />
        </Float>
        <Sparkles count={900} scale={11} size={1.2} speed={.18} opacity={.38} />
      </Canvas>
    </div>
  );
}