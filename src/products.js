import { useStore, MAIN } from './store';
import { useT } from './i18n';

// The main product (from settings, default Milk / litre) and the extra products in one place.
//   main:    { id: 'main', name, unit, price }
//   extras:  catalogue products (active and stopped)
//   forSale: everything that can be sold or delivered now (main first)
//   byId(id) -> product, also for 'main'
export function useProducts() {
  const { data } = useStore();
  const t = useT();
  const s = data.settings;
  const main = {
    id: MAIN,
    name: s.mainName || t.mainProductDefault,
    unit: s.mainUnit || t.mainUnitDefault,
    price: Number(s.mainPrice) || 0,
    active: true,
    main: true,
  };
  const extras = data.products;
  const byId = (id) => (id === MAIN ? main : extras.find((p) => p.id === id));
  return { main, extras, forSale: [main, ...extras.filter((p) => p.active !== false)], byId };
}
