import { describe, expect, it } from 'vitest';
import { handleRender } from '../src/tools/render.js';
import { handleValidate } from '../src/tools/validate.js';

function textOf(result: { content: Array<{ type: string; text?: string }> }): string {
  return result.content[0]?.text ?? '';
}

describe('@coral-viz/mcp-server edition 0.2.14 and anemone/ane parity', () => {
  it('validates and renders infrastructure and Crow\'s Foot ERD in hifi and ane', async () => {
    const infra = [
      '@diagram infrastructure',
      '@coralVersion "0.2.14"',
      'edge cdn [technology: "CloudFront"] as "CDN"',
      'vpc vpc [provider: "aws"] as "VPC" {',
      '  api compute [technology: "EKS"] as "API"',
      '  db database [technology: "Aurora"] as "DB"',
      '}',
      'edge -> vpc.api [technology: "HTTPS"]',
      'vpc.api -> vpc.db [technology: "SQL"]',
    ].join('\n');
    const val = await handleValidate({ content: infra });
    expect(val.isError).toBeFalsy();
    const rendered = await handleRender({ content: infra, format: 'svg', style: 'ane', direction: 'RIGHT' });
    expect(rendered.isError).toBeFalsy();
    const infraSvg = textOf(rendered);
    expect(infraSvg).toContain('<svg');
    expect(infraSvg).toContain('CloudFront');

    const erd = [
      '@diagram erd',
      '@coralVersion "0.2.14"',
      'user entity as "User" {',
      '  columns {',
      '    id uuid [pk]',
      '  }',
      '}',
      'post entity as "Post" {',
      '  columns {',
      '    id uuid [pk]',
      '    user_id uuid [fk]',
      '  }',
      '}',
      'user ||--o{ post as "writes"',
    ].join('\n');
    const erdVal = await handleValidate({ content: erd });
    expect(erdVal.isError).toBeFalsy();
    const erdRendered = await handleRender({ content: erd, format: 'svg', style: 'anemone', direction: 'RIGHT' });
    expect(erdRendered.isError).toBeFalsy();
    const erdSvg = textOf(erdRendered);
    expect(erdSvg).toContain('PK id: uuid');
    expect(erdSvg).toContain('writes');
  });
});
