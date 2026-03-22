/**
 * ═══════════════════════════════════════════════════════════════════
 *  KUPOVINA → BUDŽET  PATCH
 *  Dodaj ovaj kod na KRAJ <script> bloka u index.html (Kupovina app),
 *  neposredno ISPRED zatvornog </script> taga.
 * ═══════════════════════════════════════════════════════════════════
 *
 *  ŠTA RADI:
 *  - Inicijalizira drugi Firebase projekt (Budžet)
 *  - Kada Nedim završi kupovinu (confirmFinish), automatski šalje
 *    zapis u Budžet Firebase pod putanjom: budzet_cehic/kupovinaSync/
 *  - Isti se dešava i kada Nedim ručno sačuva račun (saveReceipt)
 *
 *  KAKO DODATI:
 *  1. Otvori index.html (Kupovina app) u editoru
 *  2. Pronađi: </script>  (zadnji zatvorni tag)
 *  3. Ubaci SVE ispod — direktno ispred </script>
 *
 *  NAPOMENA:
 *  Zamijeni sve ZAMIJENI_SA_ vrijednosti sa tvojim Budžet Firebase configom!
 * ═══════════════════════════════════════════════════════════════════
 */

// ─── 1. BUDŽET FIREBASE CONFIG ────────────────────────────────────
//  Zamijeni ove vrijednosti sa podacima iz tvog novog Firebase projekta
const BUDZET_FB_CONFIG = {
  apiKey:            "AIzaSyAuGptv4IhaUFTM1pWLyliM7C2_LDXDVbo",
  authDomain:        "budzet-app-544ee.firebaseapp.com",
  databaseURL:       "https://budzet-app-544ee-default-rtdb.europe-west1.firebasedatabase.app",
  projectId:         "budzet-app-544ee",
  storageBucket:     "budzet-app-544ee.firebasestorage.app",
  messagingSenderId: "173846226186",
  appId:             "1:173846226186:web:37753daa0858e7c4cb06f3"
};

// ─── 2. INIT BUDŽET FIREBASE ──────────────────────────────────────
let dbBudzet = null;
const ROOT_BUDZET = 'budzet_cehic';

(function initBudzet() {
  try {
    // Provjeri da li već postoji 'budzet' app (izbjegavamo duplikat)
    const existing = firebase.apps.find(a => a.name === 'budzet');
    const budzetApp = existing
      ? existing
      : firebase.initializeApp(BUDZET_FB_CONFIG, 'budzet');
    dbBudzet = budzetApp.database();
    console.log('[Budžet Sync] Firebase spreman.');
  } catch(e) {
    console.error('[Budžet Sync] Init greška:', e);
  }
})();

// ─── 3. HELPER: POŠALJI KUPOVINU U BUDŽET ─────────────────────────
/**
 * Šalje završenu kupovinu u Budžet Firebase.
 * @param {Object} entry - { id, date, title, amount, store, itemCount, buyer, source }
 */
function syncKupovinaInBudzet(entry) {
  if(!dbBudzet) {
    console.warn('[Budžet Sync] Firebase nije spreman.');
    return;
  }
  if(entry.buyer !== 'Nedim') {
    // Šalje samo Nedimove kupovine u Budžet
    return;
  }
  const path = `${ROOT_BUDZET}/kupovinaSync/${entry.id}`;
  dbBudzet.ref(path).set({
    id:        entry.id,
    date:      entry.date,      // 'YYYY-MM-DD'
    title:     entry.title,
    amount:    entry.amount,
    store:     entry.store || '',
    itemCount: entry.itemCount || 0,
    buyer:     entry.buyer,
    source:    entry.source,    // 'history' ili 'receipt'
    syncedAt:  Date.now()
  })
  .then(() => console.log('[Budžet Sync] ✓ Sinhronizovano:', entry.title, entry.amount, 'KM'))
  .catch(err => console.error('[Budžet Sync] Greška:', err));
}

// ─── 4. PATCH: confirmFinish ───────────────────────────────────────
//
//  PRONAĐI u index.html ovu funkciju:
//
//    function confirmFinish(){
//      if(!finishBuyer)return;
//      const total=items.reduce((s,i)=>s+(parseFloat(i.price)||0),0);
//      history.unshift({id:Date.now(),date:new Date().toISOString(),...});
//      saveHistory();activeBuyer=finishBuyer;saveBuyer();items=[];saveItems();closeFinish();renderList();
//      updatePresence(false);
//      toast('✅ Kupovina sačuvana! '+(finishBuyer==='Nedim'?'💚':'💗'));
//    }
//
//  ZAMIJENI JE OVOM VERZIJOM:
//
//  (Ili, alternativno, samo dodaj syncKupovinaInBudzet() poziv u
//   postojeću confirmFinish funkciju — pogledaj komentar "DODAJ OVU LINIJU")

const _originalConfirmFinish = window.confirmFinish || confirmFinish;

window.confirmFinish = function confirmFinishPatched() {
  if(!finishBuyer) return;

  const total     = items.reduce((s,i) => s + (parseFloat(i.price)||0), 0);
  const sessionId = Date.now();
  const dateISO   = new Date().toISOString();

  history.unshift({
    id:        sessionId,
    date:      dateISO,
    buyer:     finishBuyer,
    total,
    itemCount: items.length,
    items:     items.map(i => ({ name:i.name, price:parseFloat(i.price)||0, cat:i.cat||'ostalo' })),
    type:      'shop'
  });

  saveHistory();
  activeBuyer = finishBuyer;
  saveBuyer();
  items = [];
  saveItems();
  closeFinish();
  renderList();
  updatePresence(false);
  toast('✅ Kupovina sačuvana! ' + (finishBuyer === 'Nedim' ? '💚' : '💗'));

  // ← DODAJ OVU LINIJU (automatski sync u Budžet)
  syncKupovinaInBudzet({
    id:        sessionId,
    date:      dateISO.slice(0, 10),       // samo 'YYYY-MM-DD'
    title:     `Kupovina (${items.length > 0 ? items.length : history[0]?.itemCount || '?'} stavki)`,
    amount:    Math.round(total * 100) / 100,
    store:     '',
    itemCount: history[0]?.itemCount || 0,
    buyer:     finishBuyer,
    source:    'history'
  });
};

// ─── 5. PATCH: saveReceipt ────────────────────────────────────────
//
//  Isti princip — patcha saveReceipt() da i ručno dodani računi
//  idu u Budžet Firebase.
//
//  PRONAĐI u index.html:
//    function saveReceipt(){...}
//
//  I dodaj na KRAJ funkcije (ispred zatvornog }):
//    syncKupovinaInBudzet({ id, date, title, amount, store, buyer, source:'receipt' });

const _origSaveReceipt = window.saveReceipt || (typeof saveReceipt !== 'undefined' ? saveReceipt : null);

window.saveReceipt = function saveReceiptPatched() {
  const title  = document.getElementById('rec-title').value.trim();
  const amount = parseFloat(document.getElementById('rec-amount').value) || 0;
  const date   = document.getElementById('rec-date').value || new Date().toISOString().split('T')[0];
  const note   = document.getElementById('rec-note').value.trim();

  if(!title)        { toast('Upiši naziv troška!'); return; }
  if(amount <= 0)   { toast('Upiši iznos!'); return; }
  if(!recBuyer)     { toast('Odaberi ko je platio!'); return; }

  const recId = Date.now();
  receipts.unshift({
    id:    recId,
    date:  date + 'T' + new Date().toTimeString().slice(0,8),
    title,
    amount,
    cat:   recCatSel,
    buyer: recBuyer,
    note
  });
  saveReceipts();

  document.getElementById('rec-title').value  = '';
  document.getElementById('rec-amount').value = '';
  document.getElementById('rec-note').value   = '';
  renderReceiptList();
  toast('💾 Račun sačuvan!');

  // ← Sync u Budžet Firebase
  syncKupovinaInBudzet({
    id:        recId,
    date:      date,
    title:     title,
    amount:    Math.round(amount * 100) / 100,
    store:     '',
    itemCount: 0,
    buyer:     recBuyer,
    source:    'receipt'
  });
};

console.log('[Budžet Sync] ✓ Patch učitan. Nedimove kupovine će se automatski slati u Budžet.');
