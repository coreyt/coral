import { describe, expect, it } from 'vitest';
import { render, CoralRenderError } from '../src/index.js';

describe('@coral-viz/browser edition 0.2.14 and anemone/ane parity', () => {
  it('renders expanded block with inline node style in hifi and anemone', async () => {
    const source = [
      '@diagram block',
      '@coralVersion "0.2.14"',
      'start oval [style: "teal, thick"] as "Start"',
      'step rounded as "Process"',
      'gate diamond as "Valid?"',
      'db cylinder as "Store"',
      'start -> step',
      'step -> gate',
      'gate -> db as "Yes"',
    ].join('\n');
    const hifi = await render(source, { style: 'hifi', direction: 'RIGHT' });
    const ane = await render(source, { style: 'ane', direction: 'RIGHT' });
    expect(hifi.svg).toContain('<svg');
    expect(hifi.svg).toContain('Process');
    expect(ane.svg).toContain('<svg');
    expect(ane.svg).toContain('Process');
  });

  it('renders C4-grade architecture with technology/description in hifi and anemone', async () => {
    const source = [
      '@diagram architecture',
      '@coralVersion "0.2.14"',
      'user person as "Customer"',
      'web container [technology: "React SPA", description: "Orders UI"] as "Web App"',
      'api container [technology: "Node.js"] as "Orders API"',
      'db database [technology: "PostgreSQL"] as "Orders DB"',
      'user -> web [technology: "HTTPS"] as "Uses"',
      'web -> api [technology: "JSON/REST"] as "Submits"',
      'api -> db [technology: "SQL"] as "Persists"',
    ].join('\n');
    const hifi = await render(source, { style: 'hifi', direction: 'RIGHT' });
    const anemone = await render(source, { style: 'anemone', direction: 'RIGHT' });
    expect(hifi.svg).toContain('React SPA');
    expect(hifi.svg).toContain('JSON/REST');
    expect(anemone.svg).toContain('Orders API');
    expect(anemone.svg).toContain('#0f766e');
  });

  it('renders dedicated cloud infrastructure diagrams with nested VPC/subnet boundaries', async () => {
    const source = [
      '@diagram infrastructure',
      '@coralVersion "0.2.14"',
      'users users as "Users"',
      'vpc vpc [provider: "aws"] as "Prod VPC" {',
      '  alb loadBalancer [technology: "ALB"] as "Ingress"',
      '  app container [technology: "ECS"] as "App"',
      '  rds database [technology: "RDS"] as "Primary DB"',
      '}',
      'users -> vpc.alb [technology: "HTTPS"]',
      'vpc.alb -> vpc.app',
      'vpc.app -> vpc.rds [technology: "TLS"]',
    ].join('\n');
    const result = await render(source, { style: 'anemone', direction: 'RIGHT' });
    expect(result.svg).toContain('Prod VPC');
    expect(result.svg).toContain('Ingress');
    expect(result.svg).toContain('Primary DB');
  });

  it('renders Crow\'s Foot ERD diagrams and rejects retired Chen syntax', async () => {
    const valid = [
      '@diagram erd',
      '@coralVersion "0.2.14"',
      'customer entity as "Customer" {',
      '  columns {',
      '    id uuid [pk]',
      '    email text [uk]',
      '  }',
      '}',
      'order entity as "Order" {',
      '  columns {',
      '    id uuid [pk]',
      '    customer_id uuid [fk]',
      '  }',
      '}',
      'customer ||--o{ order as "places"',
    ].join('\n');
    const rendered = await render(valid, { style: 'hifi', direction: 'RIGHT' });
    expect(rendered.svg).toContain('Customer');
    expect(rendered.svg).toContain('PK id: uuid');
    expect(rendered.svg).toContain('places');

    const retired = '@diagram erd\n@coralVersion "0.2.14"\nemail attribute as "Email"\n';
    await expect(render(retired)).rejects.toThrow(CoralRenderError);
  });
});
