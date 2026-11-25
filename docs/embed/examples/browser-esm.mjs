import { render, renderTo } from '@coral-viz/browser';

export const source = `@diagram architecture
api service as "API"
orders database as "Orders"
api -> orders`;

export const options = { title: 'Order service', style: 'hifi', direction: 'RIGHT' };
export const result = await render(source, options);

if (typeof document !== 'undefined') {
  await renderTo('#diagram', source, options);
}
