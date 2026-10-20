// src/utils/geonamesApi.ts

// 👇 保持你已經填好的帳號
const GEONAMES_USERNAME = "whip0224"; 

/**
 * 透過 Google Maps 的經緯度，向 GeoNames 查詢對應的中文地名
 */
export async function getChineseNameByCoords(lat: number, lng: number): Promise<string | null> {
  if (!GEONAMES_USERNAME || GEONAMES_USERNAME === "你的帳號") {
    console.warn("請先填寫 GEONAMES_USERNAME");
    return null;
  }

  try {
    // 💡 升級點 1：改用 findNearbyJSON，並加入 featureClass=A (行政區) 與 featureClass=P (城市聚落)
    // 這樣可以略過沒有翻譯的細碎小街道，直接抓取有建檔的「區」或「市」
    const url = `https://secure.geonames.org/findNearbyJSON?lat=${lat}&lng=${lng}&lang=zh&radius=2&featureClass=A&featureClass=P&style=FULL&username=${GEONAMES_USERNAME}`;
    
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    
    const data = await response.json();

    if (data.geonames && data.geonames.length > 0) {
      // 💡 鐵則：永遠只看距離最近的第一個結果，絕不偷看其他區
      const nearestPlace = data.geonames[0];
      
      if (nearestPlace.alternateNames) {
        // 第一志願：優先找中文 (zh, zh-TW, zh-CN)
        const zhAlt = nearestPlace.alternateNames.find((alt: any) => alt.lang?.startsWith('zh'));
        if (zhAlt) {
          return zhAlt.name; // 找到就立刻回傳，結束函式
        }

        // 第二志願：找日文漢字
        const jaAlt = nearestPlace.alternateNames.find((alt: any) => 
          alt.lang === 'ja' && /[\u4e00-\u9fa5]/.test(alt.name)
        );
        if (jaAlt) {
          return jaAlt.name; // 找到就立刻回傳，結束函式
        }
      }

      // 如果這「唯一的一筆」真的沒有中文也沒有漢字，才回傳原本的英文
      return nearestPlace.name;
    }

    console.log("[GeoNames API] 找不到對應的地點資訊");
    return null;
  } catch (error) {
    console.error("[GeoNames API] 請求失敗:", error);
    return null;
  }
}