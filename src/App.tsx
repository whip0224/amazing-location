import { useState, useEffect } from 'react';
import { cityTranslationMap } from './cityTranslations';

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

// --- 資料結構 ---
interface GooglePlace {
  id: string;
  displayName?: { text: string }; // 加上 ? 保護
  formattedAddress?: string;      // 加上 ? 保護
  location?: {
    latitude: number;
    longitude: number;
  };
  addressComponents?: {           // 加上 ? 保護
    longText: string;
    types: string[];
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
  customTags?: string[];
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'search' | 'list'>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<GooglePlace[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<GooglePlace | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [savedPlaces, setSavedPlaces] = useState<GooglePlace[]>([]);
  const [listSearchQuery, setListSearchQuery] = useState(''); 
  const [selectedCountryTab, setSelectedCountryTab] = useState<string>('全部'); 
  const [expandedCards, setExpandedCards] = useState<string[]>([]);
  const [centerId, setCenterId] = useState<string | null>(null);
  const [nearbyIds, setNearbyIds] = useState<string[]>([]);
  const [isExportMode, setIsExportMode] = useState(false);
  const [selectedExportIds, setSelectedExportIds] = useState<string[]>([]);
  
  // 新增：紀錄國家分類的折疊狀態 (預設為空，我們在渲染時把未定義視為展開)
  const [expandedRegions, setExpandedRegions] = useState<Record<string, boolean>>({});

  const toggleRegion = (region: string) => {
    setExpandedRegions(prev => ({ ...prev, [region]: prev[region] === false ? true : false }));
  };

  // --- 📝 編輯功能狀態 ---
  const [editingPlace, setEditingPlace] = useState<GooglePlace | null>(null);
  const [editForm, setEditForm] = useState({ name: '', city: '', tags: '' });

  const openEditModal = (place: GooglePlace) => {
    setEditingPlace(place);
    setEditForm({
      name: place.customName || place.displayName?.text || '未知名稱',
      city: place.customCity || getCountryAndCity(place.addressComponents || []).city,
      tags: place.customTags ? place.customTags.join(', ') : ''
    });
  };

  const saveEdit = () => {
    if (!editingPlace) return;
    const updatedPlaces = savedPlaces.map(p => {
      if (p.id === editingPlace.id) {
        return {
          ...p,
          customName: editForm.name,
          customCity: editForm.city,
          customTags: editForm.tags.split(',').map(t => t.trim()).filter(t => t !== '')
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
  };

  const handleFindBranches = async (targetPlace: GooglePlace) => {
    const displayNameStr = targetPlace.displayName?.text || '';
    if (!displayNameStr) {
      alert('此地點缺少名稱，無法搜尋分店！');
      return;
    }
    const brandName = displayNameStr.split('-')[0].split('(')[0].split(' ')[0].trim();
    
    setActiveTab('search');
    setSearchQuery(brandName);
    
    if (!targetPlace.location?.latitude) {
      alert('此地點缺少座標資訊，請直接使用手動搜尋！');
      return;
    }

    setIsSearching(true);
    setResults([]);
    setSelectedLocation(null);

    try {
      const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
      const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.addressComponents,places.nationalPhoneNumber,places.rating,places.userRatingCount,places.regularOpeningHours,places.location'
        },
        body: JSON.stringify({ 
          textQuery: brandName, 
          languageCode: 'zh-TW', 
          maxResultCount: 10,
          locationBias: {
            circle: {
              center: {
                latitude: targetPlace.location.latitude,
                longitude: targetPlace.location.longitude
              },
              radius: 5000.0
            }
          }
        })
      });
      const data = await response.json();
      setResults(data.places || []);
    } catch (error) {
      console.error("API 錯誤:", error);
      alert("搜尋失敗，請確認 API 金鑰");
    } finally {
      setIsSearching(false);
    }
  };
  
  useEffect(() => {
    const localData = localStorage.getItem('amazing_locations');
    if (localData) {
      setSavedPlaces(JSON.parse(localData));
    }
  }, []);

  const getCountryAndCity = (components: GooglePlace['addressComponents'] = []) => {
    const country = components.find(c => c.types.includes('country'))?.longText || '';
    let city = components.find(c => 
      c.types.includes('administrative_area_level_1') || 
      c.types.includes('locality')
    )?.longText || '';
    
    const normalizedCountry = country.includes('台灣') || country === 'Taiwan' ? '🇹🇼 台灣' :
                              country.includes('日本') || country === 'Japan' ? '🇯🇵 日本' : 
                              country.includes('韓國') || country === 'South Korea' ? '🇰🇷 韓國' :
                              country || '🌍 其他地區';

    Object.keys(cityTranslationMap).forEach(engKey => {
      if (city.includes(engKey)) {
        city = city.replace(engKey, cityTranslationMap[engKey]).trim();
      }
    });

    return { country: normalizedCountry, city: city || '未分類地區' };
  };

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setSelectedLocation(null);

    try {
      const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
      const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.addressComponents,places.nationalPhoneNumber,places.rating,places.userRatingCount,places.regularOpeningHours,places.location'
        },
        body: JSON.stringify({ textQuery: searchQuery, languageCode: 'zh-TW', maxResultCount: 5 })
      });
      const data = await response.json();
      setResults(data.places || []);
    } catch (error) {
      console.error("API 錯誤:", error);
      alert("搜尋失敗，請確認 API 金鑰");
    } finally {
      setIsSearching(false);
    }
  };

  const handleSaveLocation = () => {
    if (!selectedLocation) return;
    if (savedPlaces.some(place => place.id === selectedLocation.id)) {
      alert('這個地點已經在你的清單中囉！'); return;
    }
    const newSavedPlaces = [selectedLocation, ...savedPlaces];
    setSavedPlaces(newSavedPlaces);
    localStorage.setItem('amazing_locations', JSON.stringify(newSavedPlaces));
    alert('🎉 成功加入我的清單！');
    setSearchQuery('');
    setSelectedLocation(null);
  };

  const handleDelete = (id: string, name: string) => {
    if (window.confirm(`確定要將「${name}」從清單移除嗎？`)) {
      const newSavedPlaces = savedPlaces.filter(place => place.id !== id);
      setSavedPlaces(newSavedPlaces);
      localStorage.setItem('amazing_locations', JSON.stringify(newSavedPlaces));
    }
  };

  const toggleCard = (id: string) => {
    setExpandedCards(prev => prev.includes(id) ? prev.filter(cardId => cardId !== id) : [...prev, id]);
  };

 const openInGoogleMaps = (place: GooglePlace) => {
    const targetQuery = place.formattedAddress || place.displayName?.text || 'Location';
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(targetQuery)}&query_place_id=${place.id}`;
    
    if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
      window.location.href = url;
    } else {
      window.open(url, '_blank');
    }
  };

  const renderOpeningHours = (hours?: GooglePlace['regularOpeningHours']) => {
    if (!hours || !hours.weekdayDescriptions) return null;
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
                const splitChar = day.includes('：') ? '：' : ': ';
                const parts = day.split(splitChar);
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

  // --- 清單過濾與國家分組 ---
  const filteredBySearch = savedPlaces.filter(place => {
    if (!listSearchQuery) return true;
    const term = listSearchQuery.toLowerCase();
    return (place.displayName?.text || '').toLowerCase().includes(term) || 
           (place.formattedAddress || '').toLowerCase().includes(term);
  });

  const displayPlaces = selectedCountryTab === '全部' 
    ? filteredBySearch 
    : filteredBySearch.filter(p => getCountryAndCity(p.addressComponents || []).country === selectedCountryTab);

  // 改為用 Region (國家) 群組
  const groupedByRegion = displayPlaces.reduce((acc, place) => {
    const { country } = getCountryAndCity(place.addressComponents || []);
    const regionKey = country || '🌍 其他地區'; 
    if (!acc[regionKey]) acc[regionKey] = [];
    acc[regionKey].push(place);
    return acc;
  }, {} as Record<string, GooglePlace[]>);

  const handleRichExport = async () => {
      if (selectedExportIds.length === 0) {
        alert('請先選擇至少一個地點！');
        return;
      }

      const exportData = savedPlaces.filter(p => selectedExportIds.includes(p.id));
      const jsonString = JSON.stringify(exportData);

      try {
        await navigator.clipboard.writeText(jsonString);
        if (window.confirm(`✅ 已選擇了 ${exportData.length} 個地點的完整資訊！\n\n是否確定匯出地點？`)) {
          setIsExportMode(false);
          setSelectedExportIds([]);
          alert("✅ 成功匯出！景點資料已複製到剪貼簿。\n\n請手動切換至「AmazingTravel」App，並點擊右上角的「📥 匯入 Location 資料」即可完成！");
        }
      } catch (err) {
        alert('複製失敗，請確認瀏覽器權限！');
        console.error(err);
      }
    };

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-800 pb-24">
      
      <div className="pt-16 pb-6 text-center px-4">
        <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">Amazing Location</h1>
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
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <button type="submit" disabled={isSearching} className="absolute right-2 top-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-blue-700 disabled:opacity-50">
                {isSearching ? '搜尋中...' : '搜尋'}
              </button>
            </form>

            {results.length > 0 && (
              <ul className="absolute z-10 mt-2 w-[calc(100%-2rem)] max-w-md rounded-2xl bg-white py-2 shadow-xl ring-1 ring-black/5 max-h-60 overflow-auto">
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
                  <span className="rounded-md bg-blue-50 text-blue-700 px-2 py-1 font-medium">{getCountryAndCity(selectedLocation.addressComponents || []).country}</span>
                  <span className="rounded-md bg-gray-100 px-2 py-1 font-medium text-gray-600">{getCountryAndCity(selectedLocation.addressComponents || []).city}</span>
                  {selectedLocation.rating && <span className="text-amber-500 font-bold ml-1">⭐ {selectedLocation.rating}</span>}
                </div>
                
                <div className="mt-4 text-sm text-gray-600 bg-gray-50 p-4 rounded-xl border border-gray-100">
                  <div className="flex items-start"><span className="mr-2">📍</span><span>{selectedLocation.formattedAddress || '無詳細地址'}</span></div>
                  {renderOpeningHours(selectedLocation.regularOpeningHours)}
                </div>

                <button onClick={handleSaveLocation} className="mt-5 w-full rounded-xl bg-blue-600 py-3.5 text-sm font-bold text-white shadow-md transition hover:bg-blue-700 active:scale-95">
                  加到我的清單
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
                <div className="mb-4">
                  <input
                    type="text"
                    placeholder="在清單中搜尋 (例如：西門町, 東京)..."
                    value={listSearchQuery}
                    onChange={(e) => setListSearchQuery(e.target.value)}
                    className="w-full rounded-xl bg-white px-4 py-3 text-sm shadow-sm ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  />
                </div>
                <div className="ml-2 mb-2 flex items-center gap-2">
                  {isExportMode ? (
                    <>
                      <button onClick={() => { setIsExportMode(false); setSelectedExportIds([]); }} className="whitespace-nowrap px-3 py-2 text-sm font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors">
                        取消
                      </button>
                      <button onClick={handleRichExport} className="whitespace-nowrap px-3 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-full transition-colors shadow-md">
                        傳送 ({selectedExportIds.length})
                      </button>
                    </>
                  ) : (
                    <button onClick={() => setIsExportMode(true)} className="whitespace-nowrap px-3 py-2 text-sm font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-full transition-colors flex items-center gap-1">
                      <span>✈️</span> 傳送到 Trip Plan
                    </button>
                  )}
                </div>
              </>
            )}

            {/* 國家分類折疊清單 */}
            <div className="space-y-4 mt-2">
              {Object.keys(groupedByRegion).length === 0 ? (
                <div className="text-center py-20 text-gray-400">
                  <div className="text-4xl mb-4">🧳</div>
                  <p>{savedPlaces.length === 0 ? '清單空空如也，快去搜尋想去的地點吧！' : '找不到符合的地點'}</p>
                </div>
              ) : (
                Object.entries(groupedByRegion).map(([region, places]) => {
                  // 預設為展開狀態
                  const isRegionExpanded = expandedRegions[region] !== false;

                  return (
                    <div key={region} className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                      {/* 分類標題列 (點擊折疊/展開) */}
                      <div 
                        className="bg-gray-50 p-4 flex justify-between items-center cursor-pointer hover:bg-gray-100 transition"
                        onClick={() => toggleRegion(region)}
                      >
                        <h2 className="text-lg font-bold text-gray-800 flex items-center">
                          {region}
                          <span className="ml-2 text-xs font-normal text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">{places.length}</span>
                        </h2>
                        <span className="text-gray-400 font-bold text-xl">
                          {isRegionExpanded ? '▲' : '▼'}
                        </span>
                      </div>

                      {/* 展開的地點內容 */}
                      {isRegionExpanded && (
                        <div className="p-3 grid gap-3 border-t border-gray-100 bg-white">
                          {places.map(place => {
                            const isExpanded = expandedCards.includes(place.id);
                            const isCenter = centerId === place.id;
                            const isNearby = nearbyIds.includes(place.id);

                            return (
                              <div key={place.id} className={`rounded-2xl shadow-sm ring-1 overflow-hidden transition-all duration-300 ${isCenter ? 'ring-blue-500 bg-blue-50' : isNearby ? 'ring-yellow-400 bg-yellow-50' : 'ring-gray-200 bg-white'}`}>
                                
                                <div 
                                  className={`p-4 flex items-center justify-between gap-3 cursor-pointer select-none hover:bg-gray-50 ${selectedExportIds.includes(place.id) ? 'bg-blue-50/50' : ''}`} 
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

                                    <h3 className="font-bold text-base text-gray-900 leading-snug flex-1 truncate">
                                      {isCenter && <span className="mr-1">📍</span>}
                                      {isNearby && <span className="mr-1">⭐</span>}
                                      {place.customName || place.displayName?.text || '未知名稱'}
                                    </h3>
                                  </div>

                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className={`text-gray-400 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>▼</span>
                                    
                                    <button 
                                      onClick={(e) => { 
                                        e.stopPropagation(); 
                                        findNearbySavedPlaces(place); 
                                      }}
                                      className={`px-3 py-1 rounded text-white ${isCenter ? 'bg-gray-400' : 'bg-green-500'}`}
                                    >
                                      {isCenter ? '❌ 取消尋找' : '📍 找附近'}
                                    </button>                                                
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); openEditModal(place); }}
                                      className="p-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-blue-500 hover:text-white transition-colors"
                                    >
                                      ✏️
                                    </button>                                
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); handleDelete(place.id, place.displayName?.text || '此地點'); }}
                                      className="p-1.5 bg-red-50 text-red-500 rounded-lg hover:bg-red-500 hover:text-white transition-colors"
                                    >
                                      🗑️
                                    </button>
                                  </div>
                                </div>
                                
                                {/* 標籤顯示 */}
                                {place.customTags && place.customTags.length > 0 && (
                                  <div className="px-4 pb-2 -mt-2 flex gap-1 flex-wrap">
                                    {place.customTags.map((tag, idx) => (
                                      <span key={idx} className="text-[10px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                                        #{tag}
                                      </span>
                                    ))}
                                  </div>
                                )}

                                {/* 展開的詳細內容 */}
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
                                        className="flex-1 py-2.5 bg-blue-100 text-blue-700 font-bold text-sm rounded-xl hover:bg-blue-200 transition-colors flex justify-center items-center gap-2"
                                      >
                                        <span>🗺️</span> 地圖開啟
                                      </button>
                                      <button
                                        onClick={() => handleFindBranches(place)}
                                        className="flex-1 py-2.5 bg-purple-100 text-purple-700 font-bold text-sm rounded-xl hover:bg-purple-200 transition-colors flex justify-center items-center gap-2"
                                      >
                                        <span>🏪</span> 找附近分店
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
              <div>
                <label className="block text-sm text-gray-600 mb-1 font-bold">所屬地區 (可手動分類)</label>
                <input type="text" value={editForm.city} onChange={e => setEditForm({...editForm, city: e.target.value})} className="w-full border border-gray-300 p-2 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1 font-bold">自訂標籤 (用逗號分隔)</label>
                <input type="text" value={editForm.tags} onChange={e => setEditForm({...editForm, tags: e.target.value})} className="w-full border border-gray-300 p-2 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" placeholder="例如：餐廳, 拉麵, 必去" />
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