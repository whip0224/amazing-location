import { useState, useRef } from 'react';
import { useCityTranslations } from './hooks/useCityTranslations';
import { getChineseNameByCoords } from './utils/geonamesApi';

// 計算兩點經緯度直線距離的公式 (回傳單位：公里)
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// 格式化距離顯示 (例如：450m 或 1.2km)
const formatDistance = (distanceKm: number) => {
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)}m`;
  }
  return `${distanceKm.toFixed(1)}km`;
};

// --- 資料結構 ---
interface GooglePlace {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  location?: {
    latitude: number;
    longitude: number;
  };
  addressComponents?: {
    longText: string;
    types?: string[];
  }[];
  nationalPhoneNumber?: string;
  rating?: number;
  userRatingCount?: number;
  regularOpeningHours?: {
    openNow: boolean;
    weekdayDescriptions: string[];
  };
  customName?: string;
  customCity?: string;
  customArea?: string;
  customTags?: string[];
  customNote?: string;
  note?: string;
  notes?: string;
}

export default function App() {
  // 🌟 1. 呼叫翻譯 Hook，取得從 Google Sheet 來的翻譯資料
  const { translations } = useCityTranslations();

  const [activeTab, setActiveTab] = useState<'search' | 'list'>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<GooglePlace[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<GooglePlace | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedPlaces, setSavedPlaces] = useState<GooglePlace[]>(() => {
    try {
      const localData = localStorage.getItem('amazing_locations');
      return localData ? JSON.parse(localData) : [];
    } catch {
      return [];
    }
  });
  const [listSearchQuery, setListSearchQuery] = useState('');
  const [selectedCountryTab, setSelectedCountryTab] = useState<string>('全部');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [areaSortMap, setAreaSortMap] = useState<Record<string, 'default' | 'name' | 'rating' | 'distance'>>({});
  const [userCoords, setUserCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [expandedCards, setExpandedCards] = useState<string[]>([]);
  const [centerId, setCenterId] = useState<string | null>(null);
  const [nearbyIds, setNearbyIds] = useState<string[]>([]);
  const [isExportMode, setIsExportMode] = useState(false);
  const [selectedExportIds, setSelectedExportIds] = useState<string[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [toastNotice, setToastNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string) => {
    setToastNotice(msg);
    window.setTimeout(() => {
      setToastNotice(prev => (prev === msg ? null : prev));
    }, 3500);
  };

  // 📝 紀錄三層分類的折疊狀態
  const [expandedRegions, setExpandedRegions] = useState<Record<string, boolean>>({});
  const [expandedCities, setExpandedCities] = useState<Record<string, boolean>>({});
  const [expandedAreas, setExpandedAreas] = useState<Record<string, boolean>>({});

  const toggleRegion = (region: string) => setExpandedRegions(prev => ({ ...prev, [region]: !prev[region] }));
  const toggleCity = (cityKey: string) => setExpandedCities(prev => ({ ...prev, [cityKey]: !prev[cityKey] }));
  const toggleArea = (areaKey: string) => setExpandedAreas(prev => ({ ...prev, [areaKey]: !prev[areaKey] }));

  // --- 📝 編輯功能狀態 ---
  const [editingPlace, setEditingPlace] = useState<GooglePlace | null>(null);
  const [editForm, setEditForm] = useState({ name: '', city: '', area: '', tags: '', note: '' });

  // 🌟 2. 升級版：自動抓取並搭配 Google Sheet 的資料進行翻譯比對
  const getCountryCityArea = (components: GooglePlace['addressComponents'] = []) => {
    const safeComponents = Array.isArray(components) ? components : [];

    const country = safeComponents.find(c => c.types?.includes('country'))?.longText || '';

    let city = safeComponents.find(c =>
      c.types?.includes('administrative_area_level_1') ||
      c.types?.includes('locality')
    )?.longText || '';

    // 設定嚴格的優先層級 (優先找「區」，找不到再找「町/商圈」)
    let area =
      safeComponents.find(c => c.types?.includes('sublocality_level_1'))?.longText ||
      safeComponents.find(c => c.types?.includes('sublocality_level_2'))?.longText ||
      safeComponents.find(c => c.types?.includes('neighborhood'))?.longText ||
      safeComponents.find(c => c.types?.includes('administrative_area_level_2'))?.longText ||
      safeComponents.find(c => c.types?.includes('administrative_area_level_3'))?.longText ||
      '';

    const normalizedCountry = country.includes('台灣') || country === 'Taiwan' ? '🇹🇼 台灣' :
                              country.includes('日本') || country === 'Japan' ? '🇯🇵 日本' :
                              country.includes('韓國') || country === 'South Korea' ? '🇰🇷 韓國' :
                              country || '🌍 其他地區';

    // 使用 Google Sheet 抓回來的 translations 狀態進行字串取代
    Object.keys(translations).forEach(key => {
      const zhTwName = translations[key]?.['zh-TW'];
      const enName = translations[key]?.['en'] || key;

      if (zhTwName) {
        if (city.includes(enName)) city = city.replace(enName, zhTwName).trim();
        if (area.includes(enName)) area = area.replace(enName, zhTwName).trim();

        if (city.toLowerCase().includes(key.toLowerCase())) city = city.replace(new RegExp(key, 'i'), zhTwName).trim();
        if (area.toLowerCase().includes(key.toLowerCase())) area = area.replace(new RegExp(key, 'i'), zhTwName).trim();
      }
    });

    return {
      country: normalizedCountry,
      city: city || '未分類城市',
      area: area || '未分類區域'
    };
  };

  // 共用：解析並翻譯城市與區域 (Google Sheet + GeoNames 雙層防護)
  const resolveTranslatedCityAndArea = async (place: GooglePlace) => {
    const autoLocation = getCountryCityArea(place.addressComponents || []);
    let finalCityName = place.customCity || autoLocation.city;
    const rawArea = place.customArea || autoLocation.area;
    let finalAreaName = rawArea;

    // 城市檢查 Google Sheet
    const cityKey = finalCityName.toLowerCase();
    if (translations[cityKey] && translations[cityKey]['zh-TW']) {
      finalCityName = translations[cityKey]['zh-TW'];
    }

    // 區域檢查：【第一層防護：查詢 Google Sheet】
    const searchKey = rawArea.toLowerCase();
    if (translations[searchKey] && translations[searchKey]['zh-TW']) {
      finalAreaName = translations[searchKey]['zh-TW'];
    }
    // 【第二層防護：查詢 GeoNames】
    else if (
      (!place.customArea || rawArea === '未分類區域' || !/[\u4e00-\u9fa5]/.test(rawArea)) &&
      place.location?.latitude &&
      place.location?.longitude
    ) {
      const geoName = await getChineseNameByCoords(place.location.latitude, place.location.longitude);
      if (geoName) {
        const geoSearchKey = geoName.toLowerCase();
        finalAreaName = (translations[geoSearchKey] && translations[geoSearchKey]['zh-TW'])
          ? translations[geoSearchKey]['zh-TW']
          : geoName;
      }
    }

    return {
      city: finalCityName || '未分類城市',
      area: finalAreaName || '未分類區域',
    };
  };

  const openEditModal = async (place: GooglePlace) => {
    // 1. 設定目前正在編輯的地點與初始值
    setEditingPlace(place);
    const autoLocation = getCountryCityArea(place.addressComponents || []);
    const existingNote = place.customNote || place.note || place.notes || '';

    setEditForm({
      name: place.customName || place.displayName?.text || '未知名稱',
      city: place.customCity || autoLocation.city,
      area: place.customArea || autoLocation.area,
      tags: place.customTags ? place.customTags.join(', ') : '',
      note: existingNote,
    });

    // 2. 執行 Google Sheet + GeoNames 翻譯補齊
    const resolved = await resolveTranslatedCityAndArea(place);

    setEditForm(prev => ({
      ...prev,
      city: place.customCity || resolved.city,
      area: resolved.area,
    }));
  };

  const saveEdit = () => {
    if (!editingPlace) return;
    const trimmedNote = editForm.note.trim();
    const updatedPlaces = savedPlaces.map(p => {
      if (p.id === editingPlace.id) {
        return {
          ...p,
          customName: editForm.name,
          customCity: editForm.city,
          customArea: editForm.area,
          customTags: editForm.tags.split(',').map(t => t.trim()).filter(t => t !== ''),
          customNote: trimmedNote,
          note: trimmedNote,
          notes: trimmedNote,
        };
      }
      return p;
    });
    setSavedPlaces(updatedPlaces);
    localStorage.setItem('amazing_locations', JSON.stringify(updatedPlaces));
    setEditingPlace(null);
  };

  const findNearbySavedPlaces = (targetPlace: GooglePlace) => {
    if (centerId === targetPlace.id) {
      setCenterId(null);
      setNearbyIds([]);
      return;
    }
    const RADIUS_KM = 2;
    const nearbyPlaces = savedPlaces.filter(place => {
      if (place.id === targetPlace.id) return false;
      if (!place.location?.latitude || !targetPlace.location?.latitude) return false;

      const distance = calculateDistance(
        targetPlace.location.latitude,
        targetPlace.location.longitude,
        place.location.latitude,
        place.location.longitude
      );

      return distance <= RADIUS_KM;
    });

    setCenterId(targetPlace.id);
    setNearbyIds(nearbyPlaces.map(p => p.id));

    // 自動展開包含中心點與所有附近景點的國家、城市、區域資料夾
    const placesToExpand = [targetPlace, ...nearbyPlaces];
    setExpandedRegions(prev => {
      const next = { ...prev };
      placesToExpand.forEach(p => {
        const { country } = getCountryCityArea(p.addressComponents || []);
        const countryKey = country || '🌍 其他地區';
        next[countryKey] = true;
      });
      return next;
    });
    setExpandedCities(prev => {
      const next = { ...prev };
      placesToExpand.forEach(p => {
        const { country, city } = getCountryCityArea(p.addressComponents || []);
        const countryKey = country || '🌍 其他地區';
        const cityKey = `${countryKey}-${p.customCity || city || '其他地區'}`;
        next[cityKey] = true;
      });
      return next;
    });
    setExpandedAreas(prev => {
      const next = { ...prev };
      placesToExpand.forEach(p => {
        const { country, city, area } = getCountryCityArea(p.addressComponents || []);
        const countryKey = country || '🌍 其他地區';
        const cityName = p.customCity || city || '其他地區';
        const areaName = p.customArea || area || '其他區域';
        const areaKey = `${countryKey}-${cityName}-${areaName}`;
        next[areaKey] = true;
      });
      return next;
    });
  };

  // 共用 Google Places Text Search (New) 請求函式：優先透過本地代理繞過開發環境 Referer 限制，靜態部署時自動切換直連
  const executePlacesSearch = async (payload: Record<string, unknown>) => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      setSearchError('尚未設定 VITE_GOOGLE_MAPS_API_KEY 環境變數。');
      return;
    }

    const headers = {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.formattedAddress,places.addressComponents,places.nationalPhoneNumber,places.rating,places.userRatingCount,places.regularOpeningHours,places.location',
    };

    setSearchError(null);

    // 開發預覽環境 (DEV) 透過 Vite Proxy 繞過 Referer 限制；Vercel 正式環境 (PROD) 直接呼叫官方 API
    const endpoint = import.meta.env.DEV
      ? '/api/places/searchText'
      : 'https://places.googleapis.com/v1/places:searchText';

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      const errStatus = data.error?.status || response.status;
      if (response.status === 403 || errStatus === 'PERMISSION_DENIED') {
        setSearchError(
          `API 金鑰網域限制 (403 PERMISSION_DENIED)：請至 Google Cloud Console 的 API 金鑰「網站限制 (HTTP Referrers)」加入目前網址：${window.location.origin}/*`
        );
      } else {
        setSearchError(`搜尋失敗 (${errStatus})：${data.error?.message || '請確認 API 金鑰與 Places API (New) 是否已啟用'}`);
      }
      setResults([]);
      return;
    }

    const places: GooglePlace[] = data.places || [];
    setResults(places);
    if (places.length === 0) {
      setSearchError('找不到符合的地點，請嘗試其他關鍵字。');
    }
  };

  const handleFindBranches = async (targetPlace: GooglePlace) => {
    const displayNameStr = targetPlace.displayName?.text || '';
    if (!displayNameStr) {
      showToast('⚠️ 此地點缺少名稱，無法搜尋分店！');
      return;
    }
    const brandName = displayNameStr.split('-')[0].split('(')[0].split(' ')[0].trim();

    setActiveTab('search');
    setSearchQuery(brandName);

    if (!targetPlace.location?.latitude) {
      showToast('⚠️ 此地點缺少座標資訊，請直接使用手動搜尋！');
      return;
    }

    setIsSearching(true);
    setResults([]);
    setSelectedLocation(null);

    try {
      await executePlacesSearch({
        textQuery: brandName,
        languageCode: 'zh-TW',
        maxResultCount: 10,
        locationBias: {
          circle: {
            center: {
              latitude: targetPlace.location.latitude,
              longitude: targetPlace.location.longitude,
            },
            radius: 5000.0,
          },
        },
      });
    } catch (error) {
      console.error('API 錯誤:', error);
      setSearchError('網路連線或 API 請求失敗，請稍後再試。');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setSelectedLocation(null);

    try {
      await executePlacesSearch({
        textQuery: searchQuery.trim(),
        languageCode: 'zh-TW',
        maxResultCount: 5,
      });
    } catch (error) {
      console.error('API 錯誤:', error);
      setSearchError('網路連線或 API 請求失敗，請稍後再試。');
    } finally {
      setIsSearching(false);
    }
  };

  // 🌟 修改提議 2：在「加入清單」當下就自動執行 Google Sheet + GeoNames 翻譯，直接把中文寫入 customCity 與 customArea
  const handleSaveLocation = async () => {
    if (!selectedLocation || isSaving) return;
    if (savedPlaces.some(place => place.id === selectedLocation.id)) {
      showToast('⚠️ 這個地點已經在你的清單中囉！');
      return;
    }

    setIsSaving(true);
    try {
      const resolved = await resolveTranslatedCityAndArea(selectedLocation);
      const placeToSave: GooglePlace = {
        ...selectedLocation,
        customCity: selectedLocation.customCity || resolved.city,
        customArea: selectedLocation.customArea || resolved.area,
      };

      const newSavedPlaces = [placeToSave, ...savedPlaces];
      setSavedPlaces(newSavedPlaces);
      localStorage.setItem('amazing_locations', JSON.stringify(newSavedPlaces));
      showToast(`🎉 成功加入清單！（已歸類至：${placeToSave.customCity} · ${placeToSave.customArea}）`);
      setSearchQuery('');
      setSelectedLocation(null);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (id: string, name: string) => {
    if (window.confirm(`確定要將「${name}」從清單移除嗎？`)) {
      const newSavedPlaces = savedPlaces.filter(place => place.id !== id);
      setSavedPlaces(newSavedPlaces);
      localStorage.setItem('amazing_locations', JSON.stringify(newSavedPlaces));
      if (centerId === id) {
        setCenterId(null);
        setNearbyIds([]);
      }
    }
  };

  const toggleCard = (id: string) => {
    setExpandedCards(prev => prev.includes(id) ? prev.filter(cardId => cardId !== id) : [...prev, id]);
  };

  // 🌟 修改提議 4：支援「整城／整區一鍵全選」或取消全選
  const toggleSelectGroupIds = (placeIds: string[]) => {
    setSelectedExportIds(prev => {
      const allSelected = placeIds.length > 0 && placeIds.every(id => prev.includes(id));
      if (allSelected) {
        return prev.filter(id => !placeIds.includes(id));
      } else {
        const nextSet = new Set([...prev, ...placeIds]);
        return Array.from(nextSet);
      }
    });
  };

  const openInGoogleMaps = (place: GooglePlace) => {
    const targetQuery = place.formattedAddress || place.displayName?.text || 'Location';
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(targetQuery)}&query_place_id=${place.id}`;

    if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
      window.location.assign(url);
    } else {
      window.open(url, '_blank');
    }
  };

  const renderOpeningHours = (hours?: GooglePlace['regularOpeningHours']) => {
    if (!hours || !Array.isArray(hours.weekdayDescriptions)) return null;
    return (
      <div className="flex items-start mt-3 pt-3 border-t border-gray-100">
        <span className="mr-2">🕒</span>
        <div className="w-full">
          <span className={`font-bold ${hours.openNow ? 'text-green-600' : 'text-red-500'}`}>
            {hours.openNow ? '營業中' : '休息中'}
          </span>
          <details className="mt-1 group cursor-pointer">
            <summary className="text-xs text-blue-600 hover:text-blue-700 font-medium list-none flex items-center outline-none">
              查看一週營業時間
              <span className="ml-1 text-[8px] transition-transform group-open:rotate-180">▼</span>
            </summary>
            <div className="mt-2 space-y-1.5 text-xs text-gray-600 bg-white p-3 rounded-lg border border-gray-100 shadow-sm">
              {hours.weekdayDescriptions.map((day, index) => {
                const safeDay = day || '';
                const splitChar = safeDay.includes('：') ? '：' : ': ';
                const parts = safeDay.split(splitChar);
                const isToday = index === (new Date().getDay() === 0 ? 6 : new Date().getDay() - 1);
                return (
                  <div key={index} className={`flex justify-between gap-4 ${isToday ? 'font-bold text-blue-600' : ''}`}>
                    <span className="shrink-0">{parts[0]}</span>
                    <span className="text-right">{parts.slice(1).join(splitChar) || '無資料'}</span>
                  </div>
                );
              })}
            </div>
          </details>
        </div>
      </div>
    );
  };

  // 🌟 修改提議 1：修復「清單內搜尋」搜不到自訂名稱、自訂城市/區域、標籤、備註與翻譯後中文的問題
  const filteredBySearch = savedPlaces.filter(place => {
    if (!listSearchQuery.trim()) return true;
    const term = listSearchQuery.trim().toLowerCase();
    const termWithoutHash = term.startsWith('#') ? term.slice(1) : term;
    const autoLoc = getCountryCityArea(place.addressComponents || []);
    const noteText = place.customNote || place.note || place.notes || '';

    const matchesText =
      (place.displayName?.text || '').toLowerCase().includes(term) ||
      (place.formattedAddress || '').toLowerCase().includes(term) ||
      (place.customName || '').toLowerCase().includes(term) ||
      (place.customCity || '').toLowerCase().includes(term) ||
      (place.customArea || '').toLowerCase().includes(term) ||
      noteText.toLowerCase().includes(term) ||
      autoLoc.country.toLowerCase().includes(term) ||
      autoLoc.city.toLowerCase().includes(term) ||
      autoLoc.area.toLowerCase().includes(term);

    const matchesTags = (place.customTags || []).some(tag => {
      const lowerTag = tag.toLowerCase();
      return lowerTag.includes(term) || (termWithoutHash.length > 0 && lowerTag.includes(termWithoutHash));
    });

    return matchesText || matchesTags;
  });

  const displayPlaces = filteredBySearch.filter(p => {
    const matchesCountry =
      selectedCountryTab === '全部' ||
      getCountryCityArea(p.addressComponents || []).country === selectedCountryTab;
    const matchesSelectedTag =
      !selectedTag || (p.customTags || []).map(t => t.trim()).includes(selectedTag);
    return matchesCountry && matchesSelectedTag;
  });

  // 統計標籤雲 (依目前所選國家分頁或全部已儲存地點統計所有自訂標籤數量)
  const placesForTagCloud = selectedCountryTab === '全部'
    ? savedPlaces
    : savedPlaces.filter(p => getCountryCityArea(p.addressComponents || []).country === selectedCountryTab);

  const tagCountsMap = placesForTagCloud.reduce((acc, place) => {
    (place.customTags || []).forEach(rawTag => {
      const tag = rawTag.trim();
      if (tag) {
        acc[tag] = (acc[tag] || 0) + 1;
      }
    });
    return acc;
  }, {} as Record<string, number>);

  const tagCloudList = Object.entries(tagCountsMap).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-Hant')
  );

  const groupedByLocation = displayPlaces.reduce((acc, place) => {
    const { country, city, area } = getCountryCityArea(place.addressComponents || []);
    const countryKey = country || '🌍 其他地區';
    const cityKey = place.customCity || city || '其他地區';
    const areaKey = place.customArea || area || '其他區域';

    if (!acc[countryKey]) acc[countryKey] = {};
    if (!acc[countryKey][cityKey]) acc[countryKey][cityKey] = {};
    if (!acc[countryKey][cityKey][areaKey]) acc[countryKey][cityKey][areaKey] = [];

    acc[countryKey][cityKey][areaKey].push(place);
    return acc;
  }, {} as Record<string, Record<string, Record<string, GooglePlace[]>>>);

  // 計算頂部「📍 附近 2km」專屬區塊的資料
  const centerPlace = centerId ? savedPlaces.find(p => p.id === centerId) || null : null;

  // 切換區域內排序方式 (名稱 A-Z / 評分 高到低 / 距離 由近到遠)
  const handleAreaSortChange = (
    areaKey: string,
    sortOption: 'default' | 'name' | 'rating' | 'distance'
  ) => {
    setAreaSortMap(prev => ({ ...prev, [areaKey]: sortOption }));
    setExpandedAreas(prev => ({ ...prev, [areaKey]: true }));

    if (sortOption === 'distance' && !centerPlace && !userCoords) {
      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          pos => {
            setUserCoords({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
            });
            showToast('📍 已取得目前定位，依距離由近到遠排序');
          },
          () => {
            showToast('💡 未開啟定位權限，已依區域基準點由近到遠排序（亦可點選任一景點「📍 附近」作為基準）');
          },
          { timeout: 6000 }
        );
      } else {
        showToast('💡 已依區域基準點由近到遠排序');
      }
    }
  };

  // 計算單一景點與目前參考基準點（📍 附近中心點 > 使用者 GPS > 該區第一筆景點）的距離
  const getDistanceForAreaSort = (place: GooglePlace, areaPlaces: GooglePlace[]): number | null => {
    if (!place.location?.latitude || !place.location?.longitude) return null;
    const refLocation =
      centerPlace?.location?.latitude && centerPlace?.location?.longitude
        ? centerPlace.location
        : userCoords
          ? userCoords
          : areaPlaces[0]?.location?.latitude && areaPlaces[0]?.location?.longitude
            ? areaPlaces[0].location
            : null;
    if (!refLocation) return null;
    return calculateDistance(
      refLocation.latitude,
      refLocation.longitude,
      place.location.latitude,
      place.location.longitude
    );
  };

  const nearbyPlacesWithDistance = centerPlace
    ? savedPlaces
        .filter(p => nearbyIds.includes(p.id))
        .map(p => {
          const distKm =
            centerPlace.location?.latitude && p.location?.latitude
              ? calculateDistance(
                  centerPlace.location.latitude,
                  centerPlace.location.longitude,
                  p.location.latitude,
                  p.location.longitude
                )
              : 0;
          return { place: p, distKm };
        })
        .sort((a, b) => a.distKm - b.distKm)
    : [];

  // 國家快速篩選列選項 (固定顯示 全部 / 🇯🇵 日本 / 🇹🇼 台灣 / 🇰🇷 韓國，若有其他國家也動態補上)
  const baseCountryTabs = ['全部', '🇯🇵 日本', '🇹🇼 台灣', '🇰🇷 韓國'];
  const extraCountryTabs = Array.from(
    new Set(savedPlaces.map(p => getCountryCityArea(p.addressComponents || []).country))
  ).filter(c => c && !baseCountryTabs.includes(c));
  const countryTabs = [...baseCountryTabs, ...extraCountryTabs];

  // 保留與 AmazingTravel (去旅行啦) 的完整接合方式，並自動帶入旅遊備註欄
  const handleRichExport = async () => {
    if (selectedExportIds.length === 0) {
      alert('請先選擇至少一個地點！');
      return;
    }

    const exportData = savedPlaces
      .filter(p => selectedExportIds.includes(p.id))
      .map(p => {
        const noteText = p.customNote || p.note || p.notes || '';
        return {
          ...p,
          customNote: noteText,
          note: noteText,
          notes: noteText,
        };
      });
    const jsonString = JSON.stringify(exportData);

    try {
      await navigator.clipboard.writeText(jsonString);
      if (window.confirm(`✅ 已選擇了 ${exportData.length} 個地點的完整資訊！\n\n是否確定匯出地點？`)) {
        setIsExportMode(false);
        setSelectedExportIds([]);
        alert('✅ 成功匯出！景點資料已複製到剪貼簿。\n\n請手動切換至「AmazingTravel」App，並點擊右上角的「📥 匯入 Location 資料」即可完成！');
      }
    } catch (err) {
      alert('複製失敗，請確認瀏覽器權限！');
      console.error(err);
    }
  };

  // 將整個「我的清單」內容匯出為單一 JSON 檔案下載作為備份
  const handleDownloadBackup = () => {
    if (savedPlaces.length === 0) {
      alert('目前清單沒有任何地點可供備份！');
      return;
    }

    const backupData = savedPlaces.map(p => {
      const noteText = p.customNote || p.note || p.notes || '';
      return {
        ...p,
        customNote: noteText,
        note: noteText,
        notes: noteText,
      };
    });

    const jsonString = JSON.stringify(backupData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const dateStr = new Date().toISOString().split('T')[0];

    const link = document.createElement('a');
    link.href = url;
    link.download = `amazing-locations-backup-${dateStr}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // 匯入 JSON 備份檔案並與現有清單智慧合併
  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      if (!Array.isArray(parsed)) {
        alert('備份檔案格式錯誤：必須是地點陣列 (JSON Array)！');
        return;
      }

      const validPlaces: GooglePlace[] = parsed
        .filter((item): item is GooglePlace => item && typeof item === 'object' && typeof item.id === 'string')
        .map(item => {
          const noteText = item.customNote || item.note || item.notes || '';
          return {
            ...item,
            customNote: noteText,
            note: noteText,
            notes: noteText,
          };
        });

      if (validPlaces.length === 0) {
        alert('備份檔案中沒有找到有效的地點資料！');
        return;
      }

      const existingMap = new Map(savedPlaces.map(p => [p.id, p]));
      let addedCount = 0;
      let updatedCount = 0;

      validPlaces.forEach(place => {
        if (existingMap.has(place.id)) {
          updatedCount++;
        } else {
          addedCount++;
        }
        existingMap.set(place.id, place);
      });

      const mergedPlaces = Array.from(existingMap.values());
      setSavedPlaces(mergedPlaces);
      localStorage.setItem('amazing_locations', JSON.stringify(mergedPlaces));
      alert(`🎉 成功匯入 JSON 備份！\n共讀取 ${validPlaces.length} 個地點（新增 ${addedCount} 個、更新 ${updatedCount} 個）。`);
    } catch (err) {
      console.error('匯入備份失敗:', err);
      alert('讀取 JSON 備份檔案失敗，請確認檔案格式是否正確！');
    } finally {
      e.target.value = '';
    }
  };

  const hasActiveSearch = Boolean(listSearchQuery.trim() || selectedTag);

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-800 pb-24">

      {toastNotice && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[120] max-w-sm w-[calc(100%-2rem)] bg-gray-900 text-white text-xs font-bold px-4 py-3 rounded-2xl shadow-xl text-center animate-in fade-in duration-200">
          {toastNotice}
        </div>
      )}

      <div className="pt-14 pb-6 text-center px-4">
        <div className="inline-flex items-center justify-center gap-3">
          <img
            src="/pwa-192x192.png"
            alt="Amazing Location Icon"
            className="w-11 h-11 rounded-2xl shadow-md ring-1 ring-black/5 object-cover"
          />
          <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">Amazing Location</h1>
        </div>
        <p className="mt-2 text-sm text-gray-500">
          {activeTab === 'search' ? '想去哪裡？剩下的交給我。' : `已收集 ${savedPlaces.length} 個超棒的地點`}
        </p>
      </div>

      <div className="mx-auto max-w-md px-4">

        {/* === 🔍 搜尋分頁 === */}
        {activeTab === 'search' && (
          <div className="animate-in fade-in duration-300">
            <form onSubmit={handleSearch} className="relative rounded-2xl bg-white p-2 shadow-sm ring-1 ring-gray-200 focus-within:ring-2 focus-within:ring-blue-500">
              <input
                type="text"
                className="w-full bg-transparent px-4 py-3 pr-24 text-base outline-none placeholder:text-gray-400"
                placeholder="輸入景點、店名或地址..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (searchError) setSearchError(null);
                }}
              />
              <button type="submit" disabled={isSearching} className="absolute right-2 top-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-blue-700 disabled:opacity-50">
                {isSearching ? '搜尋中...' : '搜尋'}
              </button>
            </form>

            {searchError && (
              <div className="mt-3 rounded-2xl bg-amber-50 border border-amber-200 p-3.5 text-xs text-amber-900 leading-relaxed break-all">
                ⚠️ {searchError}
              </div>
            )}

            {results.length > 0 && (
              <ul className="relative z-10 mt-2 w-full rounded-2xl bg-white py-2 shadow-xl ring-1 ring-black/5 max-h-64 overflow-auto">
                {results.map((place) => (
                  <li key={place.id} onClick={() => { setSelectedLocation(place); setResults([]); setSearchQuery(place.displayName?.text || '未知名稱'); }} className="cursor-pointer px-5 py-3 hover:bg-blue-50 border-b border-gray-50 last:border-0">
                    <div className="font-bold text-gray-900">{place.displayName?.text || '未知名稱'}</div>
                    <div className="text-xs text-gray-500 truncate mt-1">{place.formattedAddress || '無詳細地址'}</div>
                  </li>
                ))}
              </ul>
            )}

            {selectedLocation && (
              <div className="mt-6 rounded-3xl bg-white p-5 shadow-xl ring-1 ring-black/5 animate-in slide-in-from-top-4 fade-in duration-300">
                <h3 className="text-xl font-bold text-gray-900">{selectedLocation.displayName?.text || '未知名稱'}</h3>
                <div className="mt-2 flex flex-wrap gap-2 text-sm">
                  <span className="rounded-md bg-blue-50 text-blue-700 px-2 py-1 font-medium">{getCountryCityArea(selectedLocation.addressComponents || []).country}</span>
                  <span className="rounded-md bg-gray-100 px-2 py-1 font-medium text-gray-600">{getCountryCityArea(selectedLocation.addressComponents || []).city}</span>
                  {selectedLocation.rating && <span className="text-amber-500 font-bold ml-1">⭐ {selectedLocation.rating}</span>}
                </div>

                <div className="mt-4 text-sm text-gray-600 bg-gray-50 p-4 rounded-xl border border-gray-100">
                  <div className="flex items-start"><span className="mr-2">📍</span><span>{selectedLocation.formattedAddress || '無詳細地址'}</span></div>
                  {renderOpeningHours(selectedLocation.regularOpeningHours)}
                </div>

                <button
                  onClick={handleSaveLocation}
                  disabled={isSaving}
                  className="mt-5 w-full rounded-xl bg-blue-600 py-3.5 text-sm font-bold text-white shadow-md transition hover:bg-blue-700 active:scale-95 disabled:opacity-60"
                >
                  {isSaving ? '正在翻譯區域並加入清單...' : '加到我的清單'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* === 📁 清單分頁 === */}
        {activeTab === 'list' && (
          <div className="animate-in fade-in duration-300 flex flex-col h-full">

            {savedPlaces.length > 0 && (
              <>
                {/* 搜尋欄 */}
                <div className="mb-2.5">
                  <input
                    type="text"
                    placeholder="搜尋名稱、#標籤、區域、備註 (如：#拉麵, 難波)..."
                    value={listSearchQuery}
                    onChange={(e) => setListSearchQuery(e.target.value)}
                    className="w-full rounded-xl bg-white px-4 py-3 text-sm shadow-sm ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  />
                </div>

                {/* 🌟 標籤雲區塊：自動統計並列出目前所有已儲存地點的自訂標籤，點擊即可篩選 */}
                {tagCloudList.length > 0 && (
                  <div className="mb-3 rounded-2xl bg-white p-3 shadow-xs ring-1 ring-gray-200/80">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-gray-500 flex items-center gap-1">
                        <span>🏷️</span> 標籤雲快速篩選
                      </span>
                      {selectedTag && (
                        <button
                          type="button"
                          onClick={() => setSelectedTag(null)}
                          className="text-[11px] font-bold text-blue-600 hover:text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full transition-colors"
                        >
                          ✕ 清除標籤 ({selectedTag})
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {tagCloudList.map(([tag, count]) => {
                        const isTagSelected = selectedTag === tag;
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => setSelectedTag(prev => (prev === tag ? null : tag))}
                            className={`px-2.5 py-1 rounded-full text-xs font-bold transition-all flex items-center gap-1 ${
                              isTagSelected
                                ? 'bg-blue-600 text-white shadow-xs scale-[1.02]'
                                : 'bg-blue-50/80 text-blue-700 hover:bg-blue-100 ring-1 ring-blue-200/60'
                            }`}
                          >
                            <span>#{tag}</span>
                            <span
                              className={`text-[10px] px-1.5 rounded-full ${
                                isTagSelected ? 'bg-blue-500 text-white' : 'bg-white/90 text-blue-600'
                              }`}
                            >
                              {count}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 🌟 修改提議 5：補回國家快速篩選列 (全部 / 🇯🇵 日本 / 🇹🇼 台灣 / 🇰🇷 韓國) */}
                <div className="mb-3 flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                  {countryTabs.map(tab => {
                    const isActive = selectedCountryTab === tab;
                    const count = tab === '全部'
                      ? filteredBySearch.length
                      : filteredBySearch.filter(p => getCountryCityArea(p.addressComponents || []).country === tab).length;

                    return (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => {
                          setSelectedCountryTab(tab);
                          if (tab !== '全部') {
                            setExpandedRegions(prev => ({ ...prev, [tab]: true }));
                          }
                        }}
                        className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1 ${
                          isActive
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'bg-white text-gray-600 hover:bg-gray-100 ring-1 ring-gray-200'
                        }`}
                      >
                        <span>{tab}</span>
                        <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isActive ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* 匯出至 Trip Plan 與 JSON 備份工具列 */}
                <div className="mb-2 flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    {isExportMode ? (
                      <>
                        <button onClick={() => { setIsExportMode(false); setSelectedExportIds([]); }} className="whitespace-nowrap px-3 py-2 text-sm font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors">
                          取消
                        </button>
                        <button onClick={handleRichExport} className="whitespace-nowrap px-3.5 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-full transition-colors shadow-md">
                          傳送 ({selectedExportIds.length})
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => setIsExportMode(true)} className="whitespace-nowrap px-3.5 py-2 text-sm font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-full transition-colors flex items-center gap-1">
                          <span>✈️</span> 傳送到 Trip Plan
                        </button>
                        <button
                          type="button"
                          onClick={handleDownloadBackup}
                          className="whitespace-nowrap px-3.5 py-2 text-sm font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-full transition-colors flex items-center gap-1"
                        >
                          <span>💾</span> 匯出備份
                        </button>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="whitespace-nowrap px-3.5 py-2 text-sm font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-full transition-colors flex items-center gap-1"
                        >
                          <span>📂</span> 匯入備份
                        </button>
                      </>
                    )}
                  </div>

                  {isExportMode && (
                    <span className="text-xs text-blue-600 font-medium">
                      💡 可直接點選城市或區域旁「全選」
                    </span>
                  )}
                </div>

                {/* 🌟 修改提議 3：在清單頂部浮出「📍 距離『某店』2km 內的景點」專屬區塊 */}
                {centerPlace && (
                  <div className="mb-3 rounded-2xl bg-amber-50/90 border border-amber-300 p-3.5 shadow-sm animate-in fade-in duration-200">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="text-xs font-bold text-amber-900 leading-snug">
                        📍 距離「{centerPlace.customName || centerPlace.displayName?.text || '未知名稱'}」2km 內的景點（共 {nearbyPlacesWithDistance.length} 個）
                      </div>
                      <button
                        type="button"
                        onClick={() => { setCenterId(null); setNearbyIds([]); }}
                        className="shrink-0 px-2 py-1 rounded-lg bg-amber-200/70 hover:bg-amber-300 text-amber-900 text-xs font-bold transition-colors"
                      >
                        ✕ 關閉
                      </button>
                    </div>

                    {nearbyPlacesWithDistance.length === 0 ? (
                      <div className="text-xs text-amber-700 bg-white/70 rounded-xl p-2.5 text-center">
                        2 公里內暫無其他收藏景點
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-60 overflow-y-auto pr-0.5">
                        {nearbyPlacesWithDistance.map(({ place, distKm }) => {
                          const autoLoc = getCountryCityArea(place.addressComponents || []);
                          const areaLabel = place.customArea || autoLoc.area;
                          const cityLabel = place.customCity || autoLoc.city;
                          const noteText = place.customNote || place.note || place.notes || '';
                          const isSelectedForExport = selectedExportIds.includes(place.id);

                          return (
                            <div
                              key={`nearby-top-${place.id}`}
                              onClick={() => {
                                if (isExportMode) {
                                  setSelectedExportIds(prev =>
                                    prev.includes(place.id) ? prev.filter(id => id !== place.id) : [...prev, place.id]
                                  );
                                } else {
                                  toggleCard(place.id);
                                }
                              }}
                              className={`bg-white rounded-xl p-2.5 border border-amber-200 shadow-xs flex items-center justify-between gap-2 cursor-pointer hover:bg-amber-50/40 transition ${
                                isSelectedForExport ? 'ring-2 ring-blue-500' : ''
                              }`}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {isExportMode && (
                                    <div className={`shrink-0 w-4 h-4 rounded border flex items-center justify-center ${isSelectedForExport ? 'bg-blue-500 border-blue-500 text-white' : 'border-gray-300'}`}>
                                      {isSelectedForExport && <span className="text-[10px]">✓</span>}
                                    </div>
                                  )}
                                  <span className="text-xs font-extrabold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">
                                    {formatDistance(distKm)}
                                  </span>
                                  <span className="text-sm font-bold text-gray-900 truncate">
                                    {place.customName || place.displayName?.text || '未知名稱'}
                                  </span>
                                </div>
                                <div className="mt-1 flex items-center gap-1.5 flex-wrap text-[11px] text-gray-500">
                                  <span className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-600 font-medium">
                                    {cityLabel} · {areaLabel}
                                  </span>
                                  {place.customTags?.map((t, idx) => (
                                    <span key={idx} className="bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-bold">
                                      #{t}
                                    </span>
                                  ))}
                                </div>
                                {noteText && (
                                  <div className="mt-1 text-[11px] text-amber-800 truncate">
                                    📝 {noteText}
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openInGoogleMaps(place);
                                  }}
                                  className="px-2 py-1 bg-blue-50 text-blue-600 rounded-lg text-xs font-bold hover:bg-blue-100"
                                >
                                  🗺️
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openEditModal(place);
                                  }}
                                  className="px-2 py-1 bg-gray-100 text-gray-600 rounded-lg text-xs font-bold hover:bg-blue-500 hover:text-white"
                                >
                                  ✏️
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* 隱藏的 JSON 備份檔案上傳元件 */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleImportBackup}
              className="hidden"
            />

            <div className="space-y-4 mt-2">
              {Object.keys(groupedByLocation).length === 0 ? (
                <div className="text-center py-20 text-gray-400">
                  <div className="text-4xl mb-4">🧳</div>
                  <p>{savedPlaces.length === 0 ? '清單空空如也，快去搜尋想去的地點吧！' : '找不到符合的地點'}</p>
                  {savedPlaces.length === 0 && (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="mt-4 inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 ring-1 ring-amber-200 rounded-full transition-colors shadow-xs"
                    >
                      <span>📂</span> 從 JSON 備份檔還原清單
                    </button>
                  )}
                </div>
              ) : (
                Object.entries(groupedByLocation).map(([country, cityGroups]) => {
                  const isCountryExpanded = !!expandedRegions[country] || hasActiveSearch || selectedCountryTab === country;

                  let countryTotalPlaces = 0;
                  Object.values(cityGroups).forEach(areaGroups => {
                    Object.values(areaGroups).forEach(places => { countryTotalPlaces += places.length; });
                  });

                  return (
                    <div key={country} className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">

                      <div
                        className="bg-gray-50 p-4 flex justify-between items-center cursor-pointer hover:bg-gray-100 transition"
                        onClick={() => toggleRegion(country)}
                      >
                        <h2 className="text-lg font-bold text-gray-800 flex items-center">
                          {country}
                          <span className="ml-2 text-xs font-normal text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">{countryTotalPlaces}</span>
                        </h2>
                        <span className="text-gray-400 font-bold text-xl">
                          {isCountryExpanded ? '▲' : '▼'}
                        </span>
                      </div>

                      {isCountryExpanded && (
                        <div className="grid border-t border-gray-100 bg-white">
                          {Object.entries(cityGroups).map(([city, areaGroups]) => {
                            const cityKey = `${country}-${city}`;
                            const isCityExpanded = !!expandedCities[cityKey] || hasActiveSearch;

                            const cityPlacesList = Object.values(areaGroups).flat();
                            const cityPlaceIds = cityPlacesList.map(p => p.id);
                            const cityTotalPlaces = cityPlacesList.length;
                            const isAllCitySelected = cityPlaceIds.length > 0 && cityPlaceIds.every(id => selectedExportIds.includes(id));

                            return (
                              <div key={cityKey} className="border-b border-gray-50 last:border-0">
                                <div
                                  className="flex justify-between items-center cursor-pointer hover:bg-gray-50 p-3 transition-colors"
                                  onClick={() => toggleCity(cityKey)}
                                >
                                  <h3 className="font-bold text-gray-700 text-base flex items-center">
                                    <span className="text-gray-400 mr-2 text-xs">📍</span>
                                    {city}
                                    <span className="ml-2 text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{cityTotalPlaces}</span>
                                  </h3>

                                  <div className="flex items-center gap-2">
                                    {isExportMode && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          toggleSelectGroupIds(cityPlaceIds);
                                        }}
                                        className={`px-2.5 py-1 rounded-full text-xs font-bold transition-colors ${
                                          isAllCitySelected
                                            ? 'bg-blue-600 text-white shadow-xs'
                                            : 'bg-blue-50 text-blue-600 hover:bg-blue-100 ring-1 ring-blue-200'
                                        }`}
                                      >
                                        {isAllCitySelected ? '✓ 已全選此城' : '全選此城'}
                                      </button>
                                    )}
                                    <span className="text-gray-400 text-sm font-bold">
                                      {isCityExpanded ? '▲' : '▼'}
                                    </span>
                                  </div>
                                </div>

                                {isCityExpanded && (
                                  <div className="bg-gray-50/50 pb-2">
                                    {Object.entries(areaGroups).map(([area, places]) => {
                                      const areaKey = `${cityKey}-${area}`;
                                      const isAreaExpanded = !!expandedAreas[areaKey] || hasActiveSearch;
                                      const areaPlaceIds = places.map(p => p.id);
                                      const isAllAreaSelected = areaPlaceIds.length > 0 && areaPlaceIds.every(id => selectedExportIds.includes(id));
                                      const currentSort = areaSortMap[areaKey] || 'default';

                                      // 依據該區域選擇的排序方式排序景點
                                      const sortedPlaces = [...places].sort((a, b) => {
                                        if (currentSort === 'name') {
                                          const nameA = a.customName || a.displayName?.text || '';
                                          const nameB = b.customName || b.displayName?.text || '';
                                          return nameA.localeCompare(nameB, 'zh-Hant');
                                        }
                                        if (currentSort === 'rating') {
                                          const ratingDiff = (b.rating ?? -1) - (a.rating ?? -1);
                                          if (ratingDiff !== 0) return ratingDiff;
                                          return (b.userRatingCount ?? 0) - (a.userRatingCount ?? 0);
                                        }
                                        if (currentSort === 'distance') {
                                          const distA = getDistanceForAreaSort(a, places) ?? Number.POSITIVE_INFINITY;
                                          const distB = getDistanceForAreaSort(b, places) ?? Number.POSITIVE_INFINITY;
                                          return distA - distB;
                                        }
                                        return 0;
                                      });

                                      return (
                                        <div key={areaKey} className="px-3 pt-2 pb-1">
                                          <div
                                            className="flex justify-between items-center gap-2 cursor-pointer hover:bg-gray-100 p-2 rounded-lg transition-colors border-l-4 border-blue-400 bg-white shadow-sm mb-2"
                                            onClick={() => toggleArea(areaKey)}
                                          >
                                            <h4 className="font-bold text-gray-600 text-sm flex items-center min-w-0">
                                              <span className="truncate">{area}</span>
                                              <span className="ml-2 shrink-0 text-[10px] text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">{places.length}</span>
                                            </h4>

                                            <div className="flex items-center gap-1.5 shrink-0">
                                              {/* 🌟 區域內景點排序下拉選單 */}
                                              <select
                                                value={currentSort}
                                                aria-label={`${area} 景點排序`}
                                                onClick={(e) => e.stopPropagation()}
                                                onChange={(e) => {
                                                  e.stopPropagation();
                                                  handleAreaSortChange(
                                                    areaKey,
                                                    e.target.value as 'default' | 'name' | 'rating' | 'distance'
                                                  );
                                                }}
                                                className="text-[11px] font-bold text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg px-2 py-1 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 cursor-pointer"
                                              >
                                                <option value="default">排序：預設</option>
                                                <option value="name">名稱 (A-Z)</option>
                                                <option value="rating">評分 (高➔低)</option>
                                                <option value="distance">距離 (近➔遠)</option>
                                              </select>

                                              {isExportMode && (
                                                <button
                                                  type="button"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    toggleSelectGroupIds(areaPlaceIds);
                                                  }}
                                                  className={`px-2.5 py-0.5 rounded-full text-xs font-bold transition-colors ${
                                                    isAllAreaSelected
                                                      ? 'bg-blue-600 text-white shadow-xs'
                                                      : 'bg-blue-50 text-blue-600 hover:bg-blue-100 ring-1 ring-blue-200'
                                                  }`}
                                                >
                                                  {isAllAreaSelected ? '✓ 已全選此區' : '全選此區'}
                                                </button>
                                              )}
                                              <span className="text-gray-400 text-xs font-bold">
                                                {isAreaExpanded ? '▲' : '▼'}
                                              </span>
                                            </div>
                                          </div>

                                          {isAreaExpanded && (
                                            <div className="grid gap-3 pl-2 pr-1 mb-3">
                                              {sortedPlaces.map(place => {
                                                const isExpanded = expandedCards.includes(place.id);
                                                const isCenter = centerId === place.id;
                                                const isNearby = nearbyIds.includes(place.id);
                                                const noteText = place.customNote || place.note || place.notes || '';
                                                const distanceFromCenter =
                                                  isNearby && centerPlace?.location?.latitude && place.location?.latitude
                                                    ? calculateDistance(
                                                        centerPlace.location.latitude,
                                                        centerPlace.location.longitude,
                                                        place.location.latitude,
                                                        place.location.longitude
                                                      )
                                                    : currentSort === 'distance'
                                                      ? getDistanceForAreaSort(place, places)
                                                      : null;

                                                return (
                                                  <div key={place.id} className={`rounded-xl shadow-sm ring-1 overflow-hidden transition-all duration-300 ${isCenter ? 'ring-blue-500 bg-blue-50' : isNearby ? 'ring-yellow-400 bg-yellow-50' : 'ring-gray-200 bg-white'}`}>

                                                    <div
                                                      className={`p-3 flex items-center justify-between gap-3 cursor-pointer select-none hover:bg-gray-50 ${selectedExportIds.includes(place.id) ? 'bg-blue-50/50' : ''}`}
                                                      onClick={() => {
                                                        if (isExportMode) {
                                                          setSelectedExportIds(prev => prev.includes(place.id) ? prev.filter(id => id !== place.id) : [...prev, place.id]);
                                                        } else {
                                                          toggleCard(place.id);
                                                        }
                                                      }}
                                                    >
                                                      <div className="flex items-center gap-3 flex-1 overflow-hidden">
                                                        {isExportMode && (
                                                          <div className={`shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${selectedExportIds.includes(place.id) ? 'bg-blue-500 border-blue-500' : 'border-gray-300'}`}>
                                                            {selectedExportIds.includes(place.id) && <span className="text-white text-xs">✓</span>}
                                                          </div>
                                                        )}

                                                        <h3 className="font-bold text-[15px] text-gray-900 leading-snug flex-1 truncate">
                                                          {isCenter && <span className="mr-1">📍</span>}
                                                          {isNearby && <span className="mr-1">⭐</span>}
                                                          {place.customName || place.displayName?.text || '未知名稱'}
                                                          {currentSort === 'rating' && place.rating && (
                                                            <span className="ml-1.5 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                                                              ⭐ {place.rating}
                                                            </span>
                                                          )}
                                                          {distanceFromCenter !== null && (
                                                            <span className="ml-1.5 text-[11px] font-extrabold text-amber-800 bg-amber-200/80 px-1.5 py-0.5 rounded">
                                                              {formatDistance(distanceFromCenter)}
                                                            </span>
                                                          )}
                                                        </h3>
                                                      </div>

                                                      <div className="flex items-center gap-2 shrink-0">
                                                        <span className={`text-gray-400 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>▼</span>

                                                        <button
                                                          onClick={(e) => {
                                                            e.stopPropagation();
                                                            findNearbySavedPlaces(place);
                                                          }}
                                                          className={`px-2.5 py-1.5 rounded text-white text-xs font-bold ${isCenter ? 'bg-gray-400' : 'bg-green-500'}`}
                                                        >
                                                          {isCenter ? '❌ 取消' : '📍 附近'}
                                                        </button>
                                                        <button
                                                          onClick={(e) => { e.stopPropagation(); openEditModal(place); }}
                                                          className="p-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-blue-500 hover:text-white transition-colors"
                                                        >
                                                          ✏️
                                                        </button>
                                                        <button
                                                          onClick={(e) => { e.stopPropagation(); handleDelete(place.id, place.customName || place.displayName?.text || '此地點'); }}
                                                          className="p-1.5 bg-red-50 text-red-500 rounded-lg hover:bg-red-500 hover:text-white transition-colors"
                                                        >
                                                          🗑️
                                                        </button>
                                                      </div>
                                                    </div>

                                                    {((place.customTags && place.customTags.length > 0) || noteText) && (
                                                      <div className="px-3 pb-2 -mt-1 space-y-1">
                                                        {place.customTags && place.customTags.length > 0 && (
                                                          <div className="flex gap-1 flex-wrap">
                                                            {place.customTags.map((tag, idx) => (
                                                              <button
                                                                key={idx}
                                                                type="button"
                                                                onClick={(e) => {
                                                                  e.stopPropagation();
                                                                  setSelectedTag(prev => (prev === tag.trim() ? null : tag.trim()));
                                                                }}
                                                                className={`text-[10px] font-bold px-1.5 py-0.5 rounded transition-colors ${
                                                                  selectedTag === tag.trim()
                                                                    ? 'bg-blue-600 text-white'
                                                                    : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                                                                }`}
                                                              >
                                                                #{tag}
                                                              </button>
                                                            ))}
                                                          </div>
                                                        )}
                                                        {noteText && (
                                                          <div className="text-xs text-amber-800 bg-amber-50/80 border border-amber-200/70 px-2 py-1 rounded-lg">
                                                            📝 {noteText}
                                                          </div>
                                                        )}
                                                      </div>
                                                    )}

                                                    {isExpanded && (
                                                      <div className="px-4 pb-4 pt-1 border-t border-gray-100 bg-gray-50/50">
                                                        <div className="text-xs text-gray-500 flex items-center gap-2 mb-3">
                                                          {place.rating && <span className="text-amber-500 font-medium bg-amber-50 px-2 py-1 rounded">⭐ {place.rating} ({place.userRatingCount || 0})</span>}
                                                        </div>
                                                        <div className="text-xs text-gray-500 bg-white p-3 rounded-xl border border-gray-100 shadow-sm">
                                                          <div className="flex items-start">
                                                            <span className="mr-1.5">📍</span>
                                                            <span>{place.formattedAddress || '無詳細地址'}</span>
                                                          </div>
                                                          {renderOpeningHours(place.regularOpeningHours)}
                                                        </div>

                                                        <div className="mt-3 flex gap-2">
                                                          <button
                                                            onClick={() => openInGoogleMaps(place)}
                                                            className="flex-1 py-2 bg-blue-100 text-blue-700 font-bold text-sm rounded-xl hover:bg-blue-200 transition-colors flex justify-center items-center gap-2"
                                                          >
                                                            <span>🗺️</span> 開啟
                                                          </button>
                                                          <button
                                                            onClick={() => handleFindBranches(place)}
                                                            className="flex-1 py-2 bg-purple-100 text-purple-700 font-bold text-sm rounded-xl hover:bg-purple-200 transition-colors flex justify-center items-center gap-2"
                                                          >
                                                            <span>🏪</span> 分店
                                                          </button>
                                                        </div>
                                                      </div>
                                                    )}
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* === 底部導覽列 === */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 pb-safe z-50">
        <div className="max-w-md mx-auto flex">
          <button onClick={() => setActiveTab('search')} className={`flex-1 py-4 flex flex-col items-center gap-1 transition-colors ${activeTab === 'search' ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>
            <span className="text-xl">🔍</span><span className="text-[10px] font-bold">搜尋地點</span>
          </button>
          <button onClick={() => setActiveTab('list')} className={`flex-1 py-4 flex flex-col items-center gap-1 relative transition-colors ${activeTab === 'list' ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>
            <span className="text-xl">📁</span><span className="text-[10px] font-bold">我的清單</span>
            {savedPlaces.length > 0 && activeTab === 'search' && <span className="absolute top-3 right-1/4 translate-x-3 w-2 h-2 bg-red-500 rounded-full border border-white"></span>}
          </button>
        </div>
      </div>

      {/* === 📝 編輯視窗 (Modal) === */}
      {editingPlace && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl">
            <h2 className="text-xl font-bold mb-4">✏️ 編輯地點資訊</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1 font-bold">店名 / 景點名稱</label>
                <input type="text" value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} className="w-full border border-gray-300 p-2 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-sm text-gray-600 mb-1 font-bold">城市</label>
                  <input type="text" value={editForm.city} onChange={e => setEditForm({...editForm, city: e.target.value})} className="w-full border border-gray-300 p-2 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" placeholder="例如：大阪" />
                </div>
                <div className="flex-1">
                  <label className="block text-sm text-gray-600 mb-1 font-bold">區域 (商圈)</label>
                  <input type="text" value={editForm.area} onChange={e => setEditForm({...editForm, area: e.target.value})} className="w-full border border-gray-300 p-2 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" placeholder="例如：梅田, 難波" />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1 font-bold">自訂標籤 (用逗號分隔)</label>
                <input type="text" value={editForm.tags} onChange={e => setEditForm({...editForm, tags: e.target.value})} className="w-full border border-gray-300 p-2 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" placeholder="例如：餐廳, 拉麵, 必去" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1 font-bold">📝 旅遊備註</label>
                <textarea
                  rows={2}
                  value={editForm.note}
                  onChange={e => setEditForm({...editForm, note: e.target.value})}
                  className="w-full border border-gray-300 p-2 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm resize-none"
                  placeholder="例如：必吃抹茶芭菲、週二公休"
                />
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button onClick={() => setEditingPlace(null)} className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200">取消</button>
              <button onClick={saveEdit} className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700">儲存變更</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}