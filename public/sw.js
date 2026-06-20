const CACHE_NAME = 'smart-bookmarks-v1';
const urlsToCache = [
  '/',
  '/static/js/bundle.js',
  '/static/css/main.css',
  '/manifest.json',
];

// Service Worker 설치
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(urlsToCache);
      })
  );
});

// Service Worker 활성화
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// 요청 처리
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // 캐시에 있으면 반환
        if (response) {
          return response;
        }
        
        // 네트워크에서 가져오기
        return fetch(event.request).then(
          (response) => {
            // 유효한 응답인지 확인
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            
            // 응답 복제
            const responseToCache = response.clone();
            
            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              });
            
            return response;
          }
        );
      })
  );
});

// 백그라운드 동기화
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync-bookmarks') {
    event.waitUntil(syncBookmarks());
  }
});

// 북마크 동기화 함수
async function syncBookmarks() {
  // 오프라인 중에 추가된 북마크를 서버에 동기화
  const offlineBookmarks = await getOfflineBookmarks();
  
  for (const bookmark of offlineBookmarks) {
    try {
      await fetch('/api/bookmarks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(bookmark),
      });
      
      // 성공하면 오프라인 저장소에서 제거
      await removeOfflineBookmark(bookmark.id);
    } catch (error) {
      console.error('Failed to sync bookmark:', error);
    }
  }
}

// 오프라인 북마크 관리 함수 (IndexedDB 사용)
async function getOfflineBookmarks() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('BookmarksDB', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(['bookmarks'], 'readonly');
      const store = transaction.objectStore('bookmarks');
      const getAllRequest = store.getAll();
      
      getAllRequest.onsuccess = () => resolve(getAllRequest.result);
      getAllRequest.onerror = () => reject(getAllRequest.error);
    };
    
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('bookmarks', { keyPath: 'id' });
    };
  });
}

async function removeOfflineBookmark(id) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('BookmarksDB', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(['bookmarks'], 'readwrite');
      const store = transaction.objectStore('bookmarks');
      const deleteRequest = store.delete(id);
      
      deleteRequest.onsuccess = () => resolve();
      deleteRequest.onerror = () => reject(deleteRequest.error);
    };
  });
}
