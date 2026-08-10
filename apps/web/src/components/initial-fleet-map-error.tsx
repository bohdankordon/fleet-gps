"use client";
export function InitialFleetMapError() { return <main><header className="hero"><p className="eyebrow">Текущий snapshot автопарка</p><h1>Карта</h1></header><section className="empty" role="alert"><h2>Не удалось загрузить данные карты</h2><p>Повторите попытку позже.</p><button type="button" onClick={() => window.location.reload()}>Повторить</button></section></main>; }
