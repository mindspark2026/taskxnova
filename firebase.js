/* =========================================================
   TaskxNova — firebase.js
   ---------------------------------------------------------
   >>> REPLACE THE CONFIG BELOW WITH YOUR OWN FIREBASE PROJECT <<<
   Firebase Console → Project Settings → General → Your apps → SDK setup
   ========================================================= */

const firebaseConfig = {
  apiKey: "AIzaSyBoPB0g06nAjC9-l0BVbaiVYJjKkUZCeL0",
  authDomain: "taskxnova-66c2c.firebaseapp.com",
  projectId: "taskxnova-66c2c",
  storageBucket: "taskxnova-66c2c.firebasestorage.app",
  messagingSenderId: "251793464699",
  appId: "1:251793464699:web:30e1dc329baec0b57171de",
  measurementId: "G-FX9464YKTW"
};

const FirebaseService = (function(){
  let app = null, auth = null, db = null, ready = false, configured = false;

  function isConfigured(){
    return firebaseConfig.apiKey && firebaseConfig.apiKey.indexOf('YOUR_') !== 0;
  }

  function init(){
    configured = isConfigured();
    if(!configured){
      console.warn('[TaskxNova] Firebase config not set — running in local-only (guest) mode. Edit firebase.js to enable cloud sync & sign-in.');
      return false;
    }
    try{
      if(typeof firebase === 'undefined'){
        console.warn('[TaskxNova] Firebase SDK not loaded.');
        return false;
      }
      app = firebase.initializeApp(firebaseConfig);
      auth = firebase.auth();
      db = firebase.firestore();
      try{ db.enablePersistence({ synchronizeTabs:true }).catch(()=>{}); }catch(e){}
      ready = true;
      return true;
    }catch(e){
      console.error('[TaskxNova] Firebase init failed', e);
      return false;
    }
  }

  return {
    init,
    isConfigured,
    isReady: () => ready,
    getAuth: () => auth,
    getDb: () => db
  };
})();
