export async function awardDailyReward(db, uid, { ref, get, update, serverTimestamp, runTransaction }) {
  try{
    const today = new Date(), pad=n=>String(n).padStart(2,'0'), dKey=`${today.getFullYear()}-${pad(today.getMonth()+1)}-${pad(today.getDate())}`;
    const baseRef = ref(db, `userRewards/${uid}/daily`);
    const snap = await get(baseRef); const data = snap.exists() ? snap.val() : {};
    // If today's key exists, reconcile balance from recorded daily entries to ensure user has been credited.
    if (data && data[dKey]) {
      try{
        // compute recorded total from daily entries (ignore lastAwardAt key)
        const recordedTotal = Object.entries(data).reduce((s,[k,v])=> (k === 'lastAwardAt' ? s : s + (Number(v||0))), 0);
        // read current user balance
        const balSnap = await get(ref(db, `users/${uid}/qbitBalance`));
        const currentBal = balSnap.exists() ? Number(balSnap.val()) : 0;
        // if balance is less than recorded total, set it to recorded total (idempotent reconciliation)
        if (currentBal < recordedTotal) {
          await runTransaction(ref(db, `users/${uid}/qbitBalance`), () => parseFloat(Number(recordedTotal).toFixed(8)));
        }
      }catch(_){}
      throw new Error('Daily reward already claimed today.');
    }
    const last7 = []; for(let i=6;i>=1;i--){ const dt=new Date(today); dt.setDate(today.getDate()-i); last7.push(`${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}`); }
    const sum7 = last7.reduce((s,k)=> s + (Number(data?.[k]||0)), 0);
    const remain = Math.max(0, 700 - sum7); if (remain <= 0) throw new Error('Weekly cap reached (700 QBitCoin).');
    const add = Math.min(100, remain);
    await update(baseRef, { [dKey]: add, lastAwardAt: serverTimestamp() });
    await runTransaction(ref(db, `users/${uid}/qbitBalance`), cur => parseFloat(((Number(cur||0) + add)).toFixed(8)));
    // notify UI listeners with refreshed balance
    try{
      const balSnap = await get(ref(db, `users/${uid}/qbitBalance`));
      const newBal = balSnap.exists() ? balSnap.val() : null;
      window.dispatchEvent(new CustomEvent('qbitBalanceChanged', { detail: { uid, balance: newBal } }));
    }catch(_){}
  }catch(e){ throw e; }
}