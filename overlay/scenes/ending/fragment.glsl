precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec3 u_accentColor;
uniform vec3 u_secondaryColor;
uniform float u_intensity;

float grain(vec2 uv) {
  return fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 centered = uv - 0.5;
  centered.x *= u_resolution.x / max(u_resolution.y, 1.0);

  float horizon = smoothstep(0.42, -0.08, centered.y + sin(centered.x * 4.0 + u_time * 0.2) * 0.05);
  float sun = smoothstep(0.26, 0.0, length(centered - vec2(0.0, -0.08)));
  float scan = smoothstep(0.02, 0.0, abs(fract((uv.y + u_time * 0.025) * 28.0) - 0.5));
  float vignette = smoothstep(1.0, 0.16, length(centered));

  vec3 dusk = mix(vec3(0.02, 0.015, 0.035), u_secondaryColor * 0.2, uv.y);
  vec3 color = dusk + u_accentColor * sun * 0.5 * u_intensity;
  color += mix(u_accentColor, u_secondaryColor, uv.x) * horizon * 0.26 * u_intensity;
  color += scan * 0.025;
  color += (grain(gl_FragCoord.xy + u_time) - 0.5) * 0.025;

  gl_FragColor = vec4(color * vignette, max(0.0, vignette));
}
