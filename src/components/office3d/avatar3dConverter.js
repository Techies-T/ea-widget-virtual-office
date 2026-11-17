import * as THREE from 'three';

const textureCache = new Map();
const profileCache = new Map();

export function computeAvatarHash(avatarUrl) {
  if (!avatarUrl || typeof avatarUrl !== 'string') return 'empty';
  const len = avatarUrl.length;
  const head = avatarUrl.slice(0, 48);
  const tail = avatarUrl.slice(-48);
  let hash = 2166136261;
  const sample = `${len}:${head}:${tail}`;
  for (let i = 0; i < sample.length; i++) {
    hash ^= sample.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `v1_${len}_${(hash >>> 0).toString(16)}`;
}

function rgbToHex(r, g, b) {
  const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
  );
}

function sampleRegionAverage(data, width, height, x0Ratio, x1Ratio, y0Ratio, y1Ratio, skipNearWhiteBg = true) {
  const x0 = Math.max(0, Math.floor(width * x0Ratio));
  const x1 = Math.min(width, Math.ceil(width * x1Ratio));
  const y0 = Math.max(0, Math.floor(height * y0Ratio));
  const y1 = Math.min(height, Math.ceil(height * y1Ratio));

  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let count = 0;

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const idx = (y * width + x) * 4;
      const a = data[idx + 3];
      if (a < 128) continue;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      // 背景の真っ白/非常に薄い背景色はスキップ
      if (skipNearWhiteBg && r > 242 && g > 242 && b > 242) continue;
      rSum += r;
      gSum += g;
      bSum += b;
      count++;
    }
  }

  if (count === 0) return null;
  return [rSum / count, gSum / count, bSum / count];
}

function colorDistance(c1, c2) {
  return Math.hypot(c1[0] - c2[0], c1[1] - c2[1], c1[2] - c2[2]);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!src.startsWith('data:')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}

/**
 * 2Dアバター画像から 3D パラメータ（色・髪型推定）と球面マップ用顔テクスチャを生成
 */
export async function buildAvatar3DAssets(avatarUrl, existingConfig = null, textureSize = 512) {
  const avatarHash = computeAvatarHash(avatarUrl);
  const texKey = `${avatarHash}_${textureSize}`;

  const cachedTexture = textureCache.get(texKey) || null;
  const hasValidExistingConfig =
    existingConfig && existingConfig.avatarHash === avatarHash && existingConfig.hairColor;

  if (cachedTexture && (hasValidExistingConfig || profileCache.has(avatarHash))) {
    return {
      config: hasValidExistingConfig ? existingConfig : profileCache.get(avatarHash),
      faceTexture: cachedTexture,
      needsServerCacheSave: false
    };
  }

  if (!avatarUrl) {
    const fallbackConfig = {
      avatarHash,
      hairColor: '#334155',
      skinColor: '#f5d0b5',
      outfitColor: '#3b82f6',
      accentColor: '#1e293b',
      hairStyle: 'short'
    };
    return { config: fallbackConfig, faceTexture: null, needsServerCacheSave: false };
  }

  try {
    const img = await loadImage(avatarUrl);

    // 解析用オフスクリーンキャンバス (64x64)
    const sampleSize = 64;
    const sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = sampleSize;
    sampleCanvas.height = sampleSize;
    const sCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });
    sCtx.drawImage(img, 0, 0, sampleSize, sampleSize);
    const imgData = sCtx.getImageData(0, 0, sampleSize, sampleSize).data;

    let derivedConfig = hasValidExistingConfig ? existingConfig : profileCache.get(avatarHash);
    let needsServerCacheSave = false;

    if (!derivedConfig) {
      const hairRgb =
        sampleRegionAverage(imgData, sampleSize, sampleSize, 0.34, 0.66, 0.08, 0.24) || [51, 65, 85];
      const skinRgb =
        sampleRegionAverage(imgData, sampleSize, sampleSize, 0.4, 0.6, 0.35, 0.56) || [245, 208, 181];
      const outfitRgb =
        sampleRegionAverage(imgData, sampleSize, sampleSize, 0.28, 0.72, 0.74, 0.96) || [59, 130, 246];
      const accentRgb =
        sampleRegionAverage(imgData, sampleSize, sampleSize, 0.42, 0.58, 0.72, 0.9) || [30, 41, 59];

      // 髪の長さ推定: 頬〜肩横領域に髪色に近いピクセルがどれくらいあるか
      let sideHairHits = 0;
      let sideTotal = 0;
      for (let y = Math.floor(sampleSize * 0.42); y < Math.floor(sampleSize * 0.75); y++) {
        for (const x of [
          Math.floor(sampleSize * 0.22),
          Math.floor(sampleSize * 0.27),
          Math.floor(sampleSize * 0.73),
          Math.floor(sampleSize * 0.78)
        ]) {
          const idx = (y * sampleSize + x) * 4;
          const rgb = [imgData[idx], imgData[idx + 1], imgData[idx + 2]];
          sideTotal++;
          if (colorDistance(rgb, hairRgb) < 70) sideHairHits++;
        }
      }
      const ratio = sideTotal > 0 ? sideHairHits / sideTotal : 0;
      const hairStyle = ratio > 0.45 ? 'long' : ratio > 0.2 ? 'medium' : 'short';

      derivedConfig = {
        avatarHash,
        hairColor: rgbToHex(hairRgb[0], hairRgb[1], hairRgb[2]),
        skinColor: rgbToHex(skinRgb[0], skinRgb[1], skinRgb[2]),
        outfitColor: rgbToHex(outfitRgb[0], outfitRgb[1], outfitRgb[2]),
        accentColor: rgbToHex(accentRgb[0], accentRgb[1], accentRgb[2]),
        hairStyle
      };
      profileCache.set(avatarHash, derivedConfig);
      needsServerCacheSave = true;
    }

    // 球面頭部用 顔テクスチャ生成
    // SphereGeometry を rotation={[0, -Math.PI / 2, 0]} にすることでテクスチャ中央 (x = 0.5) が +Z 正面を向く
    let faceTexture = cachedTexture;
    if (!faceTexture) {
      const texCanvas = document.createElement('canvas');
      texCanvas.width = textureSize;
      texCanvas.height = textureSize;
      const ctx = texCanvas.getContext('2d');

      // ベースを肌色で塗る（側面や顎下にも自然に繋がる）
      ctx.fillStyle = derivedConfig.skinColor;
      ctx.fillRect(0, 0, textureSize, textureSize);

      // 背面〜側面の上部は髪色で自然にグラデーションカバー
      const hairGrad = ctx.createLinearGradient(0, 0, 0, textureSize * 0.62);
      hairGrad.addColorStop(0, derivedConfig.hairColor);
      hairGrad.addColorStop(0.75, derivedConfig.hairColor);
      hairGrad.addColorStop(1, derivedConfig.skinColor);
      ctx.fillStyle = hairGrad;
      ctx.fillRect(0, 0, textureSize, textureSize * 0.62);

      // 正面中央領域 (幅44%, 高さ62%) に 2D アバターの顔〜頭部分を綺麗に配置
      const faceW = textureSize * 0.44;
      const faceH = textureSize * 0.62;
      const faceX = (textureSize - faceW) / 2;
      const faceY = textureSize * 0.14;

      ctx.save();
      // 楕円クリップで周囲を滑らかにフェード
      ctx.beginPath();
      ctx.ellipse(
        textureSize / 2,
        faceY + faceH * 0.5,
        faceW * 0.48,
        faceH * 0.48,
        0,
        0,
        Math.PI * 2
      );
      ctx.clip();

      // 元画像の顔部分（中央やや上寄り）をクロップして描画
      const srcW = img.naturalWidth || img.width || 512;
      const srcH = img.naturalHeight || img.height || 512;
      ctx.drawImage(
        img,
        srcW * 0.14,
        srcH * 0.04,
        srcW * 0.72,
        srcH * 0.72,
        faceX,
        faceY,
        faceW,
        faceH
      );
      ctx.restore();

      faceTexture = new THREE.CanvasTexture(texCanvas);
      faceTexture.colorSpace = THREE.SRGBColorSpace;
      faceTexture.anisotropy = 16;
      faceTexture.needsUpdate = true;
      textureCache.set(texKey, faceTexture);
    }

    return {
      config: derivedConfig,
      faceTexture,
      needsServerCacheSave
    };
  } catch {
    const fallbackConfig = {
      avatarHash,
      hairColor: '#334155',
      skinColor: '#f5d0b5',
      outfitColor: '#3b82f6',
      accentColor: '#1e293b',
      hairStyle: 'short'
    };
    return { config: fallbackConfig, faceTexture: null, needsServerCacheSave: false };
  }
}
