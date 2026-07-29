export function createGroundShader(textureImage) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const gl = canvas.getContext("webgl", {
    alpha: false,
    antialias: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: true,
  });

  if (!gl) {
    const fallback = canvas.getContext("2d");
    fallback.drawImage(textureImage, 0, 0, textureImage.width / 2, textureImage.height / 2, 0, 0, canvas.width, canvas.height);
    return { canvas, update() {}, isShader: false };
  }

  const vertexSource = `
    attribute vec2 aPosition;
    varying vec2 vUv;
    void main() {
      vUv = aPosition * 0.5 + 0.5;
      gl_Position = vec4(aPosition, 0.0, 1.0);
    }
  `;

  const fragmentSource = `
    precision mediump float;
    uniform sampler2D uAtlas;
    uniform float uTime;
    uniform float uScroll;
    uniform float uBoost;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    void main() {
      vec2 uv = vUv;
      float ribbon = sin(uv.x * 18.0 + uv.y * 3.0);
      float caster = sin(uv.x * 42.0 + uv.y * 8.0);
      uv.y += ribbon * 0.025 + caster * 0.009;
      uv.x += sin(uv.y * 12.0) * 0.015;

      vec2 repeated = fract(vec2(uv.x * 3.2, uv.y * 1.8));
      vec2 atlasUv = repeated * 0.5;
      vec3 color = texture2D(uAtlas, atlasUv).rgb;
      color = pow(color, vec3(0.78)) * 1.22 + vec3(0.025, 0.045, 0.075);

      float laneWear = smoothstep(0.48, 0.05, abs(vUv.y - 0.52));
      float fleck = step(0.985, hash(floor(vUv * vec2(180.0, 70.0))));
      color *= 0.94 + laneWear * 0.19;
      color += vec3(0.95, 0.72, 0.22) * fleck * 0.28;
      color += vec3(0.05, 0.09, 0.14) * sin(vUv.x * 90.0 + uScroll * 0.05) * uBoost * 0.06;
      gl_FragColor = vec4(color, 1.0);
    }
  `;

  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader) || "Ground shader compilation failed");
    }
    return shader;
  }

  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || "Ground shader link failed");
  }

  gl.useProgram(program);
  const position = gl.getAttribLocation(program, "aPosition");
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textureImage);
  gl.uniform1i(gl.getUniformLocation(program, "uAtlas"), 0);

  const timeLoc = gl.getUniformLocation(program, "uTime");
  const scrollLoc = gl.getUniformLocation(program, "uScroll");
  const boostLoc = gl.getUniformLocation(program, "uBoost");
  gl.viewport(0, 0, canvas.width, canvas.height);

  return {
    canvas,
    isShader: true,
    update(time, scroll, boost) {
      gl.useProgram(program);
      gl.uniform1f(timeLoc, time);
      gl.uniform1f(scrollLoc, scroll);
      gl.uniform1f(boostLoc, boost);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.flush();
    },
  };
}
