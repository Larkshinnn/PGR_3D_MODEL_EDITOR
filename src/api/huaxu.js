const API_BASE = 'https://api.huaxu.app/servers/ap';
const ASSETS_BASE = 'https://assets.huaxu.app';

const characterListCache = { data: null, promise: null };
const characterDetailCache = new Map();

export function huaxuImageUrl(imagePath, size = '') {
  if (!imagePath) return '';
  if (/^https?:\/\//i.test(imagePath)) return imagePath;
  const clean = String(imagePath).replace(/^\/+/, '').toLowerCase();
  const useSize = size && !clean.includes('icontools/');
  const suffix = useSize ? `.${size}` : '';
  return `${ASSETS_BASE}/glb/${clean}${suffix}.webp`;
}

export function huaxuModelBaseUrl(modelPath) {
  if (!modelPath) return '';
  if (/^https?:\/\//i.test(modelPath)) {
    return modelPath.endsWith('/') ? modelPath : `${modelPath}/`;
  }
  const clean = String(modelPath).replace(/^\/+|\/+$/g, '').toLowerCase();
  return `${ASSETS_BASE}/models/${clean}/`;
}

export async function fetchCharacterList() {
  if (characterListCache.data) return characterListCache.data;
  if (characterListCache.promise) return characterListCache.promise;

  characterListCache.promise = fetch(`${API_BASE}/characters`, {
    mode: 'cors',
    cache: 'force-cache',
  })
    .then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status} mengambil daftar karakter`);
      const json = await res.json();
      const rawList = json?.data?.characters || json?.characters || [];
      const list = rawList.map((char) => ({
        id: char.id,
        slug: char.slug,
        characterName: char.characterName || char.frameName || char.slug,
        frameName: char.frameName || char.characterName || char.slug,
        frameType: char.frameType || 'omniframe',
        frameCode: char.frameCode || '',
        priority: Number(char.priority) || 0,
        quality: Number(char.quality) || 3,
        rankLabel: qualityToRank(char.quality, char.frameType),
        element: (char.element || char.elements?.[0]?.element || 'physical').toLowerCase(),
        elements: char.elements || [],
        className: char.class || 'Construct',
        intro: char.intro || '',
        iconUrl: huaxuImageUrl(char.icons?.normal || char.icons?.round, '256'),
        iconFallbackUrl: huaxuImageUrl(char.icons?.round || char.icons?.normal),
        portraitUrl: huaxuImageUrl(char.image, '256'),
        weaponGroup: char.weaponGroup?.name || '',
      }));
      list.sort((a, b) => b.priority - a.priority);
      characterListCache.data = list;
      return list;
    })
    .finally(() => {
      characterListCache.promise = null;
    });

  return characterListCache.promise;
}

export async function fetchCharacterDetail(slug) {
  if (!slug) throw new Error('Slug karakter kosong');
  if (characterDetailCache.has(slug)) return characterDetailCache.get(slug);

  const promise = fetch(`${API_BASE}/characters/${encodeURIComponent(slug)}`, {
    mode: 'cors',
    cache: 'force-cache',
  }).then(async (res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status} mengambil detail ${slug}`);
    const json = await res.json();
    const data = json?.data || {};
    const char = data.character || {};

    const coatings = (data.coatings || [])
      .filter((c) => c.model)
      .map((c) => ({
        id: `coating-${c.id}`,
        coatingId: c.id,
        type: 'coating',
        badge: c.generic ? 'Default' : `Coating ★${c.quality || 5}`,
        name: c.name || char.frameName || 'Coating',
        subtitle: c.description || (c.generic ? 'Default Construct Coating' : 'Special Coating'),
        description: c.worldDescription || '',
        quality: Number(c.quality) || 5,
        generic: Boolean(c.generic),
        released: c.released !== false,
        iconUrl: huaxuImageUrl(c.headIcon || c.icon || char.icons?.normal, '256'),
        cardArtUrl: c.art ? huaxuImageUrl(c.art) : huaxuImageUrl(c.icon || char.image),
        modelPath: c.model,
        baseUrl: huaxuModelBaseUrl(c.model),
      }));

    const chibis = (data.chibis || [])
      .filter((ch) => ch.model)
      .map((ch, idx) => ({
        id: `chibi-${ch.kind || idx}`,
        type: 'chibi',
        badge: `Chibi · ${(ch.kind || 'dorm').toUpperCase()}`,
        name: `${char.frameName || char.characterName} (${capitalize(ch.kind || 'Dorm')})`,
        subtitle: `Chibi ${capitalize(ch.kind || 'Dorm')} Model`,
        description: 'Model chibi interaktif dari mode Dorm / Cute.',
        quality: 4,
        generic: false,
        released: true,
        iconUrl: huaxuImageUrl(ch.icon || ch.roundIcon || char.icons?.round),
        cardArtUrl: huaxuImageUrl(ch.roundIcon || ch.icon || char.icons?.normal),
        modelPath: ch.model,
        baseUrl: huaxuModelBaseUrl(ch.model),
      }));

    const models = [...coatings, ...chibis];

    return {
      slug: char.slug || slug,
      characterName: char.characterName || '',
      frameName: char.frameName || '',
      frameCode: char.frameCode || '',
      className: char.class || '',
      element: (char.element || 'physical').toLowerCase(),
      quality: Number(char.quality) || 3,
      rankLabel: qualityToRank(char.quality, char.frameType),
      intro: char.intro || '',
      iconUrl: huaxuImageUrl(char.icons?.normal, '256'),
      portraitUrl: huaxuImageUrl(char.image),
      signatureWeapon: data.signatureWeapon
        ? {
            name: data.signatureWeapon.name,
            iconUrl: huaxuImageUrl(data.signatureWeapon.iconBig || data.signatureWeapon.icon),
            slug: data.signatureWeapon.slug,
          }
        : null,
      coatings,
      chibis,
      models,
    };
  });

  characterDetailCache.set(slug, promise);
  promise.catch(() => characterDetailCache.delete(slug));
  return promise;
}

function qualityToRank(quality, frameType) {
  if (frameType === 'uniframe') return 'S (Uniframe)';
  const q = Number(quality);
  if (q >= 3) return 'S-Rank';
  if (q === 2) return 'A-Rank';
  return 'B-Rank';
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}
