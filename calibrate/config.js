export const MODEL_URL = './model/adam-masterplan.min.glb';
export const FLAT_THRESHOLD = 0.1;

export const PRESETS = {
  'Official Light': {
    background:'#f7f7f2',
    face:'#f6f6f0', faceTint:0.65, faceOpacity:0.72, faceRoughness:0.97, faceMetalness:0.0,
    slab:'#f2f3ee', slabOpacity:0.95, slabRoughness:1.0,
    edge:'#d6e296', edgeOpacity:0.42, edgeWidth:1.0, edgeAngle:30,
    glow:'#d9ef8e', glowOpacity:0.22, glowWidth:3.0, glowStrength:1.0, glowExpansion:0.0,
    dotColor:'#d8e89b', dotOpacity:0.30, dotSize:0.16, dotSpacing:1.4, dotSkew:0.5,
    dotBaseOpacity:0.35, rippleSpeed:1.2, rippleFrequency:0.35, rippleWidth:0.5,
    rippleStrength:0.8, rippleOriginX:0, rippleOriginZ:0,
    hemisphere:0.6, key:1.4, rim:0.5, exposure:0.85, keyTint:'#fff6e8'
  },
  'Soft Lime': {
    background:'#f4f6ea',
    face:'#eef3dd', faceTint:0.8, faceOpacity:0.62, faceRoughness:0.95, faceMetalness:0.0,
    slab:'#eceee2', slabOpacity:0.9, slabRoughness:1.0,
    edge:'#b9d24a', edgeOpacity:0.6, edgeWidth:1.4, edgeAngle:30,
    glow:'#c8f542', glowOpacity:0.34, glowWidth:5.0, glowStrength:1.3, glowExpansion:0.002,
    dotColor:'#c8f542', dotOpacity:0.42, dotSize:0.18, dotSpacing:1.2, dotSkew:0.5,
    dotBaseOpacity:0.28, rippleSpeed:1.6, rippleFrequency:0.42, rippleWidth:0.45,
    rippleStrength:1.0, rippleOriginX:0, rippleOriginZ:0,
    hemisphere:0.55, key:1.2, rim:0.3, exposure:0.9, keyTint:'#fffbea'
  },
  'Mono Soft': {
    background:'#eeeeee',
    face:'#ffffff', faceTint:0.4, faceOpacity:0.8, faceRoughness:1.0, faceMetalness:0.0,
    slab:'#e4e4e4', slabOpacity:1.0, slabRoughness:1.0,
    edge:'#9a9a9a', edgeOpacity:0.5, edgeWidth:1.0, edgeAngle:30,
    glow:'#cfcfcf', glowOpacity:0.18, glowWidth:3.0, glowStrength:0.8, glowExpansion:0.0,
    dotColor:'#b4b4b4', dotOpacity:0.25, dotSize:0.14, dotSpacing:1.6, dotSkew:0.5,
    dotBaseOpacity:0.4, rippleSpeed:0.9, rippleFrequency:0.3, rippleWidth:0.55,
    rippleStrength:0.6, rippleOriginX:0, rippleOriginZ:0,
    hemisphere:0.7, key:1.3, rim:0.0, exposure:0.85, keyTint:'#ffffff'
  },
  'Dark Studio': {
    background:'#14161a',
    face:'#dfe4e8', faceTint:0.55, faceOpacity:0.55, faceRoughness:0.9, faceMetalness:0.05,
    slab:'#20242a', slabOpacity:1.0, slabRoughness:1.0,
    edge:'#c8f542', edgeOpacity:0.75, edgeWidth:1.2, edgeAngle:30,
    glow:'#c8f542', glowOpacity:0.4, glowWidth:6.0, glowStrength:1.6, glowExpansion:0.003,
    dotColor:'#c8f542', dotOpacity:0.5, dotSize:0.15, dotSpacing:1.3, dotSkew:0.5,
    dotBaseOpacity:0.2, rippleSpeed:1.8, rippleFrequency:0.4, rippleWidth:0.4,
    rippleStrength:1.2, rippleOriginX:0, rippleOriginZ:0,
    hemisphere:0.35, key:1.6, rim:0.4, exposure:0.95, keyTint:'#eaf3ff'
  }
};

export const START_POSE = { azimuth:42, elevation:24, zoom:1.35, panX:-0.10, panZ:-0.02 };

export const CAM = [
  ['azimuth','Azimuth °',-180,180,1], ['elevation','Elevation °',2,89,1],
  ['zoom','Zoom / distance',0.15,2.5,0.01], ['panX','Pan X',-0.6,0.6,0.01], ['panZ','Pan Z',-0.6,0.6,0.01]
];
export const LIGHT = [
  ['hemisphere','Hemisphere',0,2,0.05], ['key','Key intensity',0,3,0.05],
  ['rim','Rim light',0,1.5,0.05], ['exposure','ACES exposure',0.2,1.6,0.01],
  ['keyTint','Key-light colour','color']
];
export const FACE = [
  ['face','Face colour','color'], ['faceTint','Face tint strength',0,1,0.01],
  ['faceOpacity','Face opacity',0.05,1,0.01], ['faceRoughness','Face roughness',0,1,0.01],
  ['faceMetalness','Face metalness',0,0.3,0.01]
];
export const SLAB = [
  ['slab','Slab colour','color'], ['slabOpacity','Slab opacity',0.05,1,0.01],
  ['slabRoughness','Slab roughness',0,1,0.01]
];
export const EDGE = [
  ['edge','Edge colour','color'], ['edgeOpacity','Edge opacity',0,1,0.01],
  ['edgeWidth','Edge width (px)',0.25,4,0.05], ['edgeAngle','Edge angle °',1,60,1]
];
export const GLOW = [
  ['glow','Glow colour','color'], ['glowOpacity','Glow opacity',0,1,0.01],
  ['glowWidth','Glow width (px)',1,14,0.1], ['glowStrength','Glow strength',0,2,0.05],
  ['glowExpansion','Glow expansion',0,0.02,0.0005]
];
export const DOTS = [
  ['dotColor','Dot colour','color'], ['dotOpacity','Dot opacity',0,1,0.01],
  ['dotSize','Dot size',0.02,0.45,0.005], ['dotSpacing','Dot spacing',0.4,6,0.05],
  ['dotSkew','Dot skew',0,1.2,0.01], ['dotBaseOpacity','Base dot opacity',0,1,0.01],
  ['rippleSpeed','Ripple speed',0,5,0.05], ['rippleFrequency','Ripple frequency',0.05,1.5,0.01],
  ['rippleWidth','Ripple width',0.02,1,0.01], ['rippleStrength','Ripple strength',0,2,0.05],
  ['rippleOriginX','Ripple origin X',-40,40,0.5], ['rippleOriginZ','Ripple origin Z',-20,20,0.5]
];