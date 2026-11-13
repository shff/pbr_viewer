'use strict';
const $ = id => document.getElementById(id);
const canvas = $('canvas');
const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, preserveDrawingBuffer: true });
const slots = [
  ['base', 'Base color', '#a27552'], ['normal', 'Normal', '#7c77b9'],
  ['roughness', 'Roughness', '#80838a'], ['metallic', 'Metallic', '#c2c1be'],
  ['ao', 'Ambient occlusion', '#a9aaa4'], ['height', 'Height', '#545861'],
  ['emissive', 'Emissive', '#4e5a47'], ['opacity', 'Opacity', '#b3b5bd'],
  ['glossiness', 'Glossiness', '#6e7380'], ['specular', 'Specular', '#9b959f'],
  ['packed', 'Packed channels', '#697a49']
];
const state = { sphere: true, rotate: true, yaw: 0, pitch: .12, zoom: 3.4, env: 0, demo: true, tiling: 1, roughness: .45, metallic: .85, normal: 1, height: .03, exposure: 1, flip: true, packed: 0 };
const maps = new Map();
let unassigned = [], notices = [], loadQueue = Promise.resolve(), workspaceVersion = 0;

function renderMaps() {
  $('maps').replaceChildren();
  const visible = slots.filter(([key], index) => index < 4 || maps.has(key));
  for (const [key, title, color] of visible) {
    const item = maps.get(key);
    const row = document.createElement('div'); row.className = 'map';
    const thumb = item ? document.createElement('img') : document.createElement('span');
    if (item) { thumb.src = item.url; thumb.alt = ''; } else { thumb.className = 'placeholder'; thumb.style.setProperty('--swatch', color); }
    const info = document.createElement('div'); info.className = 'map-info';
    const name = document.createElement('div'); name.className = 'map-name'; name.textContent = title;
    const file = document.createElement('div'); file.className = 'map-file'; file.textContent = item ? item.name : state.demo ? 'Procedural demo' : 'No map · using default';
    file.title = file.textContent; info.append(name, file); row.append(thumb, info);
    if (item) {
      const status = document.createElement('span'); status.className = 'status'; status.textContent = '✓'; row.append(status);
      const remove = document.createElement('button'); remove.textContent = '×'; remove.title = `Remove ${title}`; remove.setAttribute('aria-label', remove.title);
      remove.onclick = () => { gl.deleteTexture(item.texture); URL.revokeObjectURL(item.url); maps.delete(key); renderMaps(); }; row.append(remove);
    }
    $('maps').append(row);
  }
  for (const item of unassigned) {
    const row = document.createElement('div'); row.className = 'map';
    const thumb = document.createElement('img'); thumb.src = item.url; thumb.alt = '';
    const name = document.createElement('div'); name.className = 'map-info map-file'; name.textContent = item.name; name.title = item.name;
    const select = document.createElement('select'); select.setAttribute('aria-label', `Assign ${item.name}`);
    const blank = document.createElement('option'); blank.textContent = 'Assign map…'; blank.value = ''; select.append(blank);
    for (const [key, title] of slots) { const option = document.createElement('option'); option.value = key; option.textContent = title; select.append(option); }
    select.onchange = () => { if (select.value) { assign(item, select.value); unassigned = unassigned.filter(x => x !== item); renderMaps(); } }; row.append(thumb, name, select); $('maps').append(row);
  }
  $('map-count').textContent = `${maps.size} MAP${maps.size === 1 ? '' : 'S'}`;
  $('file-message').textContent = [...notices, unassigned.length ? `${unassigned.length} unmatched file(s). Choose a map type above.` : ''].filter(Boolean).join(' ');
}

function detect(name) {
  const stem = name.toLowerCase().replace(/\.[^.]+$/, '');
  const s = stem.replace(/[^a-z0-9]+/g, ' ');
  if (/(?:^| )(orm|arm|rma|mra|occlusionroughnessmetallic|occlusionroughnessmetalness)(?: |$)/.test(s)) return ['packed', /(?:^| )rma(?: |$)/.test(s) ? 1 : /(?:^| )mra(?: |$)/.test(s) ? 2 : 0];
  const rules = [
    ['normal', /normal|(?:^| )(nor|nrm|n|normalgl|normaldx)(?: |$)/],
    ['ao', /ambient.?occlusion|occlusion|(?:^| )ao(?: |$)/],
    ['roughness', /roughness|rough|(?:^| )rgh(?: |$)/],
    ['metallic', /metallic|metalness|(?:^| )(metal|mtl)(?: |$)/],
    ['height', /height|displacement|displace|(?:^| )(disp|bump)(?: |$)/],
    ['emissive', /emissive|emission|(?:^| )emit(?: |$)/],
    ['opacity', /opacity|alpha|transparency/],
    ['glossiness', /glossiness|gloss|smoothness/],
    ['specular', /specular|(?:^| )spec(?: |$)/],
    ['base', /base.?colou?r|albedo|diffuse|colou?r|(?:^| )(diff|col|bc)(?: |$)/]
  ];
  for (const [key, regex] of rules) if (regex.test(s)) return [key, 0];
  return null;
}

function assign(item, key, packing = 0) {
  const previous = maps.get(key);
  if (previous) { unassigned.push(previous); notices.push(`${previous.name} moved to unassigned; ${item.name} uses ${key}.`); }
  maps.set(key, item);
  if (key === 'packed') state.packed = packing;
}

async function importFiles(files) {
  const version = workspaceVersion; notices = [];
  if (!gl) return;
  for (const file of files) {
    const url = URL.createObjectURL(file);
    try {
      const image = new Image(); image.src = url; await image.decode();
      if (version !== workspaceVersion) { URL.revokeObjectURL(url); continue; }
      const max = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      if (image.width > max || image.height > max) throw new Error(`exceeds ${max}px GPU limit`);
      const texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT); gl.generateMipmap(gl.TEXTURE_2D);
      const ext = gl.getExtension('EXT_texture_filter_anisotropic');
      if (ext) gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
      const item = { texture, name: file.name, url };
      const match = detect(file.name);
      if (match) assign(item, ...match); else unassigned.push(item);
      state.demo = false;
      $('material-name').textContent = file.name.replace(/\.[^.]+$/, '');
    } catch (error) { URL.revokeObjectURL(url); if (version === workspaceVersion) notices.push(`Could not load ${file.name}: ${error.message || 'unsupported image'}.`); }
  }
  if (version === workspaceVersion) renderMaps();
}

const vertexSource = `#version 300 es
in vec2 position;
void main(){gl_Position=vec4(position,0.,1.);}`;
const fragmentSource = `#version 300 es
precision highp float;
out vec4 frag;
uniform vec2 resolution;
uniform float yaw,pitch,zoom,tiling,roughness,metallic,normalStrength,heightStrength,exposure;
uniform int sphere,demo,environment,flipGreen,packing;
uniform sampler2D baseMap,normalMap,roughnessMap,metallicMap,aoMap,heightMap,emissiveMap,opacityMap,glossinessMap,specularMap,packedMap;
uniform int hasBase,hasNormal,hasRoughness,hasMetallic,hasAo,hasHeight,hasEmissive,hasOpacity,hasGlossiness,hasSpecular,hasPacked;
const float PI=3.14159265359;
float hash(vec3 p){p=fract(p*.3183099+vec3(.1,.3,.7));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){return .5*noise(p)+.25*noise(p*2.07)+.125*noise(p*4.13)+.0625*noise(p*8.33);}
mat3 rotation(){float c=cos(yaw),s=sin(yaw),a=cos(pitch),b=sin(pitch);return mat3(c,0,-s,0,1,0,s,0,c)*mat3(1,0,0,0,a,b,0,-b,a);}
vec3 sky(vec3 d,float r){
 vec3 top=vec3(.38,.42,.55),bottom=vec3(.055,.065,.09),key=vec3(1.7,1.6,1.45),rim=vec3(.58,.72,1.1);
 if(environment==1){top=vec3(.25,.07,.48);key=vec3(1.9,.3,2.5);rim=vec3(.05,1.8,2.4);}
 if(environment==2){top=vec3(.58,.29,.16);key=vec3(2.6,1.3,.45);rim=vec3(.55,.45,1.);}
 vec3 c=mix(bottom,top,clamp(d.y*.6+.45,0.,1.));
 float power=mix(150.,2.,r*r);
 c+=key*pow(max(0.,dot(d,normalize(vec3(-.7,1.,1.5)))),power)*mix(2.,.25,r);
 c+=rim*pow(max(0.,dot(d,normalize(vec3(1.,.4,.4)))),power)*mix(1.2,.2,r);
 c+=vec3(.4)*pow(max(0.,dot(d,normalize(vec3(.1,1.,-.8)))),mix(70.,2.,r))*mix(1.,.1,r);
 return c;
}
vec3 light(vec3 n,vec3 v,vec3 l,vec3 radiance,vec3 base,vec3 f0,float metal,float rough){
 vec3 h=normalize(v+l);float nl=max(dot(n,l),0.),nv=max(dot(n,v),.001),nh=max(dot(n,h),0.),hv=max(dot(h,v),0.);
 float a=rough*rough,a2=a*a,den=nh*nh*(a2-1.)+1.;float D=a2/(PI*den*den+.00001);
 float k=(rough+1.)*(rough+1.)/8.;float G=nv/(nv*(1.-k)+k)*nl/(nl*(1.-k)+k);
 vec3 F=f0+(1.-f0)*pow(1.-hv,5.);
 return ((1.-F)*(1.-metal)*base/PI+D*G*F/(4.*nv*nl+.0001))*radiance*nl;
}
void main(){
 vec2 q=(gl_FragCoord.xy-.5*resolution)/resolution.y;
 vec3 ro=vec3(0,0,zoom),rd=normalize(vec3(q*2.,-2.7));mat3 rot=rotation();vec3 o=transpose(rot)*ro,d=transpose(rot)*rd;
 float t=-1.;vec3 p,n;vec2 uv;vec3 tangent,bitangent;
 if(sphere==1){float b=dot(o,d),c=dot(o,o)-1.,disc=b*b-c;if(disc>=0.)t=-b-sqrt(disc);}
 else{if(abs(d.z)>.0001){float hit=-o.z/d.z;vec3 pp=o+d*hit;if(hit>0.&&abs(pp.x)<1.08&&abs(pp.y)<1.08)t=hit;}}
 vec3 bg=mix(vec3(.062,.071,.1),vec3(.155,.14,.19),exp(-dot(q,q)*2.));
 if(environment==1)bg+=vec3(.035,0,.055)*exp(-length(q-vec2(-.4,.1))*3.);
 if(environment==2)bg+=vec3(.045,.015,0)*exp(-length(q-vec2(-.4,.1))*3.);
 float groundY=q.y+.65;float grid=(1.-smoothstep(.0,.014,abs(fract(q.x*12.+.5)-.5)))*(1.-smoothstep(.0,.014,abs(fract(groundY*20.)-.5)));
 bg+=grid*.012*smoothstep(-.25,-.65,q.y);bg*=1.-.5*exp(-q.x*q.x*9.-pow((q.y+.48)*16.,2.));
 if(t<0.){frag=vec4(pow(bg,vec3(1./2.2)),1);return;}
 p=o+d*t;
 if(sphere==1){n=normalize(p);uv=vec2(atan(p.z,p.x)/(2.*PI)+.5,asin(clamp(p.y,-1.,1.))/PI+.5);tangent=normalize(vec3(-p.z,0,p.x)+vec3(.000001,0,0));bitangent=cross(tangent,n);}
 else{n=vec3(0,0,1);if(d.z>0.)n=-n;uv=p.xy/2.16+.5;tangent=vec3(1,0,0);bitangent=vec3(0,1,0);}
 vec3 v=normalize(o-p);uv*=tiling;
 if(hasHeight==1){vec3 vt=vec3(dot(v,tangent),dot(v,bitangent),abs(dot(v,n)));float h=texture(heightMap,uv).r-.5;uv-=vt.xy/max(vt.z,.25)*h*heightStrength;vec2 e=1./vec2(textureSize(heightMap,0));float dx=texture(heightMap,uv+vec2(e.x,0)).r-texture(heightMap,uv-vec2(e.x,0)).r;float dy=texture(heightMap,uv+vec2(0,e.y)).r-texture(heightMap,uv-vec2(0,e.y)).r;n=normalize(n-tangent*dx*heightStrength*40.-bitangent*dy*heightStrength*40.);}
 vec3 base=vec3(.55,.31,.16);float rough=roughness,metal=metallic,ao=1.;
 if(demo==1){vec3 z=p*7.;float patina=smoothstep(.39,.58,fbm(z));float grain=noise(p*220.);base=mix(vec3(.42,.19,.065),vec3(.025,.22,.16),patina);base*=.6+fbm(z*6.)*.8;rough=clamp(roughness+patina*.3+(grain-.5)*.13,.04,1.);metal=metallic*(1.-patina*.85);n=normalize(n+tangent*(noise(p*140.)-.5)*.18*normalStrength+bitangent*(noise(p*140.+10.)-.5)*.18*normalStrength);}
 if(hasBase==1)base=pow(texture(baseMap,uv).rgb,vec3(2.2));
 if(hasPacked==1){vec3 pack=texture(packedMap,uv).rgb;if(packing==0){ao=pack.r;rough=pack.g;metal=pack.b;}else if(packing==1){rough=pack.r;metal=pack.g;ao=pack.b;}else{metal=pack.r;rough=pack.g;ao=pack.b;}}
 if(hasGlossiness==1)rough=1.-texture(glossinessMap,uv).r;
 if(hasRoughness==1)rough=texture(roughnessMap,uv).r;
 if(hasMetallic==1)metal=texture(metallicMap,uv).r;
 if(hasAo==1)ao=texture(aoMap,uv).r;
 rough=clamp(rough,.045,1.);metal=clamp(metal,0.,1.);
 if(hasNormal==1){vec3 nn=texture(normalMap,uv).xyz*2.-1.;nn.xy*=normalStrength;if(flipGreen==1)nn.y=-nn.y;n=normalize(tangent*nn.x+bitangent*nn.y+n*max(nn.z,.01));}
 n=normalize(rot*n);v=normalize(rot*v);
 vec3 f0=mix(vec3(.04),base,metal);if(hasSpecular==1)f0=pow(texture(specularMap,uv).rgb,vec3(2.2));
 vec3 key=vec3(4.,3.6,3.2),rim=vec3(1.5,1.9,2.7);
 if(environment==1){key=vec3(4.,.6,5.);rim=vec3(.15,4.,5.);}
 if(environment==2){key=vec3(5.,2.4,.8);rim=vec3(1.,.8,2.);}
 vec3 color=light(n,v,normalize(vec3(-.7,1.,1.5)),key,base,f0,metal,rough)+light(n,v,normalize(vec3(1.,.4,.4)),rim,base,f0,metal,rough);
 float nv=max(dot(n,v),0.);vec3 F=f0+(max(vec3(1.-rough),f0)-f0)*pow(1.-nv,5.);
 color+=(base*(1.-metal)*sky(n,1.)*.6+sky(reflect(-v,n),rough)*F)*ao;
 if(hasEmissive==1)color+=pow(texture(emissiveMap,uv).rgb,vec3(2.2))*2.;
 color*=exposure;color=(color*(2.51*color+.03))/(color*(2.43*color+.59)+.14);color=pow(clamp(color,0.,1.),vec3(1./2.2));
 float alpha=hasOpacity==1?texture(opacityMap,uv).r:hasBase==1?texture(baseMap,uv).a:1.;
 frag=vec4(mix(pow(bg,vec3(1./2.2)),color,alpha),1.);
}`;

let program, uniforms, fallback;
if (gl) {
  try {
    const shaders = [[gl.VERTEX_SHADER, vertexSource], [gl.FRAGMENT_SHADER, fragmentSource]].map(([type, source]) => {
      const shader = gl.createShader(type); gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader)); return shader;
    });
    program = gl.createProgram(); shaders.forEach(shader => gl.attachShader(program, shader)); gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    uniforms = Object.fromEntries(Array.from({ length: gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) }, (_, i) => { const name = gl.getActiveUniform(program, i).name; return [name, gl.getUniformLocation(program, name)]; }));
    const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,3,-1,-1,3]), gl.STATIC_DRAW);
    const attr = gl.getAttribLocation(program, 'position'); gl.enableVertexAttribArray(attr); gl.vertexAttribPointer(attr, 2, gl.FLOAT, false, 0, 0);
    fallback = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, fallback); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255,255,255,255])); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    let last = 0;
    const draw = time => {
      const dt = Math.min((time-last)/1000,.05); last=time;
      if (state.rotate) state.yaw += dt*.16;
      const dpr = Math.min(devicePixelRatio || 1, 2), w = Math.round(canvas.clientWidth*dpr), h = Math.round(canvas.clientHeight*dpr);
      if (canvas.width !== w || canvas.height !== h) { canvas.width=w; canvas.height=h; gl.viewport(0,0,w,h); }
      gl.uniform2f(uniforms.resolution,w,h);
      for (const key of ['yaw','pitch','zoom','tiling','roughness','metallic','exposure']) gl.uniform1f(uniforms[key],state[key]);
      gl.uniform1f(uniforms.normalStrength,state.normal); gl.uniform1f(uniforms.heightStrength,state.height);
      for (const [key,value] of Object.entries({ sphere: +state.sphere, demo: +state.demo, environment: state.env, flipGreen: +state.flip, packing: state.packed })) gl.uniform1i(uniforms[key],value);
      slots.forEach(([key],i) => { gl.activeTexture(gl.TEXTURE0+i); gl.bindTexture(gl.TEXTURE_2D,maps.get(key)?.texture || fallback); gl.uniform1i(uniforms[`${key}Map`],i); gl.uniform1i(uniforms[`has${key[0].toUpperCase()+key.slice(1)}`],+maps.has(key)); });
      gl.drawArrays(gl.TRIANGLES,0,3); requestAnimationFrame(draw);
    }; requestAnimationFrame(draw);
  } catch (error) { $('render-error').hidden=false; $('render-error').textContent=`The renderer could not start: ${error.message}`; }
} else { $('render-error').hidden=false; $('render-error').textContent='WebGL 2 is unavailable. Enable hardware acceleration and WebGL in your browser to preview materials.'; }

$('drop-zone').onclick = () => $('file-input').click();
const enqueue = files => { const batch = [...files]; loadQueue = loadQueue.then(() => importFiles(batch)).catch(error => { notices=[error.message]; renderMaps(); }); };
$('file-input').onchange = event => { enqueue(event.target.files); event.target.value=''; };
let dragDepth=0;
document.addEventListener('dragenter',event => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); dragDepth++; $('drop-overlay').hidden=false; } });
document.addEventListener('dragover',event => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); event.dataTransfer.dropEffect='copy'; } });
document.addEventListener('dragleave',event => { if (event.dataTransfer.types.includes('Files')) { dragDepth=Math.max(0,dragDepth-1); if (!dragDepth) $('drop-overlay').hidden=true; } });
document.addEventListener('drop',event => { event.preventDefault(); dragDepth=0; $('drop-overlay').hidden=true; if (event.dataTransfer.files.length) enqueue(event.dataTransfer.files); });
window.addEventListener('blur',()=>{dragDepth=0;$('drop-overlay').hidden=true;});
for (const key of ['tiling','roughness','metallic','normal','height','exposure']) {
  $(key).oninput=()=>{state[key]=Number($(key).value);$(`${key}-out`).textContent=key==='tiling'?`${state[key].toFixed(1)}×`:state[key].toFixed(key==='height'?3:2);};
}
$('flip-normal').onchange=()=>state.flip=$('flip-normal').checked;
for(const shape of ['sphere','plane']) $(shape).onclick=()=>{state.sphere=shape==='sphere';$('sphere').classList.toggle('active',state.sphere);$('plane').classList.toggle('active',!state.sphere);state.pitch=state.sphere?.12:0;state.yaw=0;};
$('rotate').onclick=()=>{state.rotate=!state.rotate;$('rotate').classList.toggle('active',state.rotate);};
$('home').onclick=()=>{state.yaw=0;state.pitch=state.sphere?.12:0;state.zoom=3.4;};
document.querySelectorAll('[data-env]').forEach(button=>button.onclick=()=>{state.env=Number(button.dataset.env);document.querySelectorAll('[data-env]').forEach(x=>x.classList.toggle('active',x===button));});
let pointer=null;
canvas.onpointerdown=event=>{pointer={id:event.pointerId,x:event.clientX,y:event.clientY};canvas.setPointerCapture(event.pointerId);state.rotate=false;$('rotate').classList.remove('active');};
canvas.onpointermove=event=>{if(!pointer||pointer.id!==event.pointerId)return;state.yaw+=(event.clientX-pointer.x)*.009;state.pitch=Math.max(-1.35,Math.min(1.35,state.pitch+(event.clientY-pointer.y)*.009));pointer.x=event.clientX;pointer.y=event.clientY;};
canvas.onpointerup=canvas.onpointercancel=()=>pointer=null;
canvas.addEventListener('wheel',event=>{event.preventDefault();state.zoom=Math.max(2,Math.min(7,state.zoom+event.deltaY*.003));},{passive:false});
$('capture').onclick=()=>{canvas.toBlob(blob=>{if(!blob)return;const a=document.createElement('a');a.download='chroma-material.png';a.href=URL.createObjectURL(blob);a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);});};
$('reset').onclick=()=>{
  workspaceVersion++;for(const item of [...maps.values(),...unassigned]){if(gl)gl.deleteTexture(item.texture);URL.revokeObjectURL(item.url);}maps.clear();unassigned=[];notices=[];
  Object.assign(state,{sphere:true,rotate:true,yaw:0,pitch:.12,zoom:3.4,env:0,demo:true,tiling:1,roughness:.45,metallic:.85,normal:1,height:.03,exposure:1,flip:true,packed:0});
  for(const key of ['tiling','roughness','metallic','normal','height','exposure']){$(key).value=state[key];$(key).oninput();}
  $('flip-normal').checked=true;$('sphere').classList.add('active');$('plane').classList.remove('active');$('rotate').classList.add('active');document.querySelectorAll('[data-env]').forEach(x=>x.classList.toggle('active',x.dataset.env==='0'));$('material-name').textContent='Oxidized copper · Demo material';renderMaps();
};
canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();$('render-error').hidden=false;$('render-error').textContent='The graphics context was lost. Reload this page to restart the viewer.';});
$('flip-normal').checked = true;
renderMaps();
