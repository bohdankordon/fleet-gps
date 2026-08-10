import Link from "next/link";
export function InitialVehicleDetailsError() { return <main><section className="empty" role="alert"><h1>Карточка автомобиля недоступна</h1><p>Не удалось получить данные автомобиля. Повторите попытку позже.</p><Link href="/">Вернуться к автопарку</Link></section></main>; }
