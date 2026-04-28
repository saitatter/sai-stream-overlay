precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec3 u_accentColor;
uniform vec3 u_secondaryColor;
uniform float u_intensity;

float wave(vec2 uv, float speed, float scale) {
  return sin((uv.x * scale) + (u_time * speed)) * cos((uv.y * (scale * 0.64)) - (u_time * speed));
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 centered = uv - 0.5;
  centered.x *= u_resolution.x / max(u_resolution.y, 1.0);

  float radius = length(centered);
  float aurora = wave(centered + vec2(0.0, sin(u_time * 0.08) * 0.12), 0.55, 8.0);
  aurora += wave(centered.yx + vec2(cos(u_time * 0.07) * 0.08, 0.0), 0.34, 13.0);
  aurora = smoothstep(-0.2, 1.0, aurora);

  vec3 deep = vec3(0.015, 0.018, 0.035);
  vec3 glow = mix(u_accentColor, u_secondaryColor, uv.x + sin(u_time * 0.12) * 0.18);
  float vignette = smoothstep(0.92, 0.18, radius);
  float beam = smoothstep(0.65, 0.02, abs(centered.y + sin(centered.x * 3.0 + u_time * 0.2) * 0.16));
  vec3 color = deep + glow * aurora * beam * u_intensity * 0.9;
  color += glow * pow(vignette, 2.0) * 0.18 * u_intensity;

  gl_FragColor = vec4(color, max(0.0, vignette));
}
