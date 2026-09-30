import { useState, useEffect } from 'react';
// 新增：把剛剛建立的字典檔引入進來！
import { cityTranslationMap } from './cityTranslations';

// --- 資料結構 ---
interface GooglePlace {
  id: string;
  displayName: { text: string };
  formattedAddress: string;
  addressComponents: {
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

  useEffect(() => {
    const localData = localStorage.getItem('amazing_locations');
    if (localData) {
      setSavedPlaces(JSON.parse(localData));
    }
  }, []);

  // --- 核心邏輯：自動翻譯與標準化 ---
  const getCountryAndCity = (components: GooglePlace['addressComponents'] = []) => {
    const country = components.find(c => c.types.includes('country'))?.longText || '';
    let city = components.find(c => 
      c.types.includes('administrative_area_level_1') || 
      c.types.includes('locality')
    )?.longText || '';
    
    const normalizedCountry = country.includes('台灣') || country === 'Taiwan' ? '🇹🇼 台灣' :
                              country.includes('日本') || country === 'Japan' ? '🇯🇵 日本' : 
                              country.includes('韓國') || country === 'South Korea' ? '🇰🇷 韓國' :
                              country || '未知國家';

    // 執行翻譯與替換 (直接使用外部引入的 cityTranslationMap)
    Object.keys(cityTranslationMap).forEach(engKey => {
      if (city.includes(engKey)) {
        city = city.replace(engKey, cityTranslationMap[engKey]).trim();
      }
    });

    return { country: normalizedCountry, city: city || '其他地區' };
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
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.addressComponents,places.nationalPhoneNumber,places.rating,places.userRatingCount,places.regularOpeningHours'
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
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.formattedAddress)}&query_place_id=${place.id}`;
    window.open(url, '_blank');
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

  // --- 清單過濾與分組 ---
  const uniqueCountries = Array.from(new Set(savedPlaces.map(p => getCountryAndCity(p.addressComponents).country))).sort();
  const countryTabs = ['全部', ...uniqueCountries];

  const filteredBySearch = savedPlaces.filter(place => {
    if (!listSearchQuery) return true;
    const term = listSearchQuery.toLowerCase();
    return place.displayName.text.toLowerCase().includes(term) || place.formattedAddress.toLowerCase().includes(term);
  });

  const displayPlaces = selectedCountryTab === '全部' 
    ? filteredBySearch 
    : filteredBySearch.filter(p => getCountryAndCity(p.addressComponents).country === selectedCountryTab);

  const groupedByCity = displayPlaces.reduce((acc, place) => {
    const { city } = getCountryAndCity(place.addressComponents);
    const cityKey = city || '其他地區';
    if (!acc[cityKey]) acc[cityKey] = [];
    acc[cityKey].push(place);
    return acc;
  }, {} as Record<string, GooglePlace[]>);

  const exportToTxt = () => {
    if (displayPlaces.length === 0) {
      alert('目前沒有可以匯出的地點！');
      return;
    }
    const textContent = displayPlaces.map(p => p.displayName.text).join('\n');
    const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `amazing_locations_${new Date().toISOString().slice(0,10)}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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
                  <li key={place.id} onClick={() => { setSelectedLocation(place); setResults([]); setSearchQuery(place.displayName.text); }} className="cursor-pointer px-5 py-3 hover:bg-blue-50 border-b border-gray-50 last:border-0">
                    <div className="font-bold text-gray-900">{place.displayName.text}</div>
                    <div className="text-xs text-gray-500 truncate mt-1">{place.formattedAddress}</div>
                  </li>
                ))}
              </ul>
            )}

            {selectedLocation && (
              <div className="mt-6 rounded-3xl bg-white p-5 shadow-xl ring-1 ring-black/5 animate-in slide-in-from-top-4 fade-in duration-300">
                <h3 className="text-xl font-bold text-gray-900">{selectedLocation.displayName.text}</h3>
                <div className="mt-2 flex flex-wrap gap-2 text-sm">
                  <span className="rounded-md bg-blue-50 text-blue-700 px-2 py-1 font-medium">{getCountryAndCity(selectedLocation.addressComponents).country}</span>
                  <span className="rounded-md bg-gray-100 px-2 py-1 font-medium text-gray-600">{getCountryAndCity(selectedLocation.addressComponents).city}</span>
                  {selectedLocation.rating && <span className="text-amber-500 font-bold ml-1">⭐ {selectedLocation.rating}</span>}
                </div>
                
                <div className="mt-4 text-sm text-gray-600 bg-gray-50 p-4 rounded-xl border border-gray-100">
                  <div className="flex items-start"><span className="mr-2">📍</span><span>{selectedLocation.formattedAddress}</span></div>
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

                <div className="flex items-center justify-between mb-2">
                  <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide flex-1">
                    {countryTabs.map(tab => (
                      <button
                        key={tab}
                        onClick={() => setSelectedCountryTab(tab)}
                        className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-bold transition-all ${
                          selectedCountryTab === tab 
                            ? 'bg-gray-900 text-white shadow-md' 
                            : 'bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>
                  <button 
                    onClick={exportToTxt}
                    className="ml-2 mb-2 whitespace-nowrap px-3 py-2 text-sm font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-full transition-colors flex items-center gap-1"
                  >
                    <span>📥</span> 匯出 TXT
                  </button>
                </div>
              </>
            )}

            <div className="space-y-6 mt-2">
              {Object.keys(groupedByCity).length === 0 ? (
                <div className="text-center py-20 text-gray-400">
                  <div className="text-4xl mb-4">🧳</div>
                  <p>{savedPlaces.length === 0 ? '清單空空如也，快去搜尋想去的地點吧！' : '找不到符合的地點'}</p>
                </div>
              ) : (
                Object.entries(groupedByCity).map(([city, places]) => (
                  <div key={city} className="space-y-3">
                    <h2 className="text-lg font-bold text-gray-800 border-l-4 border-blue-500 pl-3 flex items-center">
                      {city}
                      <span className="ml-2 text-xs font-normal text-gray-400 bg-gray-200 px-2 py-0.5 rounded-full">{places.length}</span>
                    </h2>
                    
                    <div className="grid gap-3">
                      {places.map(place => {
                        const isExpanded = expandedCards.includes(place.id);
                        return (
                          <div key={place.id} className="bg-white rounded-2xl shadow-sm ring-1 ring-gray-200 overflow-hidden transition-all duration-300">
                            
                            <div className="p-4 flex items-center justify-between gap-3 cursor-pointer select-none hover:bg-gray-50" onClick={() => toggleCard(place.id)}>
                              <h3 className="font-bold text-base text-gray-900 leading-snug flex-1 truncate">
                                {place.displayName.text}
                              </h3>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className={`text-gray-400 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>▼</span>
                                <button 
                                  onClick={(e) => { e.stopPropagation(); handleDelete(place.id, place.displayName.text); }}
                                  className="p-1.5 bg-red-50 text-red-500 rounded-lg hover:bg-red-500 hover:text-white transition-colors"
                                >
                                  🗑️
                                </button>
                              </div>
                            </div>

                            {isExpanded && (
                              <div className="px-4 pb-4 pt-1 border-t border-gray-100 bg-gray-50/50">
                                <div className="text-xs text-gray-500 flex items-center gap-2 mb-3">
                                  {place.rating && <span className="text-amber-500 font-medium bg-amber-50 px-2 py-1 rounded">⭐ {place.rating} ({place.userRatingCount})</span>}
                                </div>
                                <div className="text-xs text-gray-500 bg-white p-3 rounded-xl border border-gray-100 shadow-sm">
                                  <div className="flex items-start">
                                    <span className="mr-1.5">📍</span>
                                    <span>{place.formattedAddress}</span>
                                  </div>
                                  {renderOpeningHours(place.regularOpeningHours)}
                                </div>
                                <button
                                  onClick={() => openInGoogleMaps(place)}
                                  className="mt-3 w-full py-2.5 bg-blue-100 text-blue-700 font-bold text-sm rounded-xl hover:bg-blue-200 transition-colors flex justify-center items-center gap-2"
                                >
                                  <span>🗺️</span> 在 Google 地圖中開啟
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
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

    </div>
  );
}