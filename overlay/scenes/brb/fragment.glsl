precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec3 u_accentColor;
uniform vec3 u_secondaryColor;
uniform float u_intensity;

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 centered = uv - 0.5;
  centered.x *= u_resolution.x / max(u_resolution.y, 1.0);

  float radius = length(centered);
  float rings = sin((radius * 28.0) - (u_time * 1.4));
  float pulse = smoothstep(0.08, 0.0, abs(rings) * radius);
  float sweep = smoothstep(0.3, 0.0, abs(centered.x + sin(u_time * 0.35 + centered.y * 4.0) * 0.18));
  float vignette = smoothstep(1.05, 0.12, radius);

  vec3 base = vec3(0.01, 0.025, 0.03);
  vec3 color = base;
  color += u_accentColor * pulse * 0.38 * u_intensity;
  color += u_secondaryColor * sweep * vignette * 0.42 * u_intensity;
  color += mix(u_accentColor, u_secondaryColor, uv.y) * pow(vignette, 3.0) * 0.18;

  gl_FragColor = vec4(color, max(0.0, vignette));
}
