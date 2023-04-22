import { transformSync } from '@babel/core';
// @ts-expect-error
import typescriptSyntax from '@babel/plugin-syntax-typescript';
// @ts-expect-error
import jsxSyntax from '@babel/plugin-syntax-jsx';
import { types as t } from '@babel/core';
import dollarPlugin, { Store } from '.';
import generate from '@babel/generator';

expect.addSnapshotSerializer({
  test: (val) => typeof val === 'string',
  print: (val) => (val as string).trim(),
});

const transform = (
  source: string,
  macros: string[] = ['css$'],
  filename = './dir/mockFilename.ts',
) => {
  const store: Store = {
    buildTimeStatements: [],
  };
  const isCssFile = filename.endsWith('.css.ts');
  const result = transformSync(source, {
    filename,
    cwd: __dirname,
    plugins: [
      [dollarPlugin, { store, macros, isCssFile }],
      [typescriptSyntax, { isTSX: true }],
      jsxSyntax,
    ],
    configFile: false,
  });

  if (!result) {
    throw new Error('No result');
  }

  const program = t.program(store.buildTimeStatements);
  const buildTimeCode = generate(
    program,
    { comments: false, sourceMaps: true, sourceFileName: filename },
    source,
  );

  return { code: result.code, buildTimeCode: buildTimeCode.code };
};

describe('babel-plugin-split-file', () => {
  it('should handle basic style calls', () => {
    const source = /* tsx */ `
      import React from 'react';
      import { style, css$ } from '@vanilla-extract/css';

      const two = 2;

      const one = css$(style({
        zIndex: two,
      }));

      export default () => \`<div id="\${id}" class="\${one}" />\``;

    const result = transform(source);

    expect(result.code).toMatchInlineSnapshot(/* tsx */ `
      import React from 'react';
      const one = _vanilla_identifier_3_0;
      export default (() => \`<div id="\${id}" class="\${one}" />\`);
    `);

    expect(result.buildTimeCode).toMatchInlineSnapshot(/* tsx */ `
      import { style, css$ } from '@vanilla-extract/css';
      const two = 2;
      export const _vanilla_identifier_3_0 = css$(style({
        zIndex: two
      }));
      const one = _vanilla_identifier_3_0;
      export default (() => \`<div id="\${id}" class="\${one}" />\`);
    `);
  });

  it('should handle expressions that create styles', () => {
    const source = /* tsx */ `
      import React from 'react';
      import { style, css$ } from '@vanilla-extract/css';

      const something = css$([1, 2].map(value => style({ zIndex: value })));

      export default () => \`<>
        <div class="\${something[0]}" />
        <div class="\${something[1]}" />
      </>\``;

    const result = transform(source);

    expect(result.code).toMatchInlineSnapshot(/* tsx */ `
      import React from 'react';
      const something = _vanilla_identifier_2_0;
      export default (() => \`<>
              <div class="\${something[0]}" />
              <div class="\${something[1]}" />
            </>\`);
    `);

    expect(result.buildTimeCode).toMatchInlineSnapshot(/* tsx */ `
      import { style, css$ } from '@vanilla-extract/css';
      export const _vanilla_identifier_2_0 = css$([1, 2].map(value => style({
        zIndex: value
      })));
      const something = _vanilla_identifier_2_0;
      export default (() => \`<>
              <div class="\${something[0]}" />
              <div class="\${something[1]}" />
            </>\`);
    `);
  });

  it('should handle shared vars between runtime and buildtime code', () => {
    const source = /* tsx */ `
      import React from 'react';
      import { style, css$ } from '@vanilla-extract/css';

      let id = 'my-id';
      let z = 1;
      z = 2;

      for (let i = 0; i < 5; i++) {
        id = id + i;
        z++;
      }

      const className = css$(style({
        ':before': {
          content: id,
          zIndex: z,
        }        
      }));

      export default () => <div id={id} className={className} />`;

    const result = transform(source);

    expect(result.code).toMatchInlineSnapshot(/* tsx */ `
      import React from 'react';
      let id = 'my-id';
      let z = 1;
      z = 2;
      for (let i = 0; i < 5; i++) {
        id = id + i;
        z++;
      }
      const className = _vanilla_identifier_6_0;
      export default (() => <div id={id} className={className} />);
    `);

    expect(result.buildTimeCode).toMatchInlineSnapshot(/* tsx */ `
      import { style, css$ } from '@vanilla-extract/css';
      let id = 'my-id';
      let z = 1;
      z = 2;
      for (let i = 0; i < 5; i++) {
        id = id + i;
        z++;
      }
      export const _vanilla_identifier_6_0 = css$(style({
        ':before': {
          content: id,
          zIndex: z
        }
      }));
      const className = _vanilla_identifier_6_0;
      export default (() => <div id={id} className={className} />);
    `);
  });

  it('should handle style inside a new function', () => {
    const source = /* tsx */ `
      import React from 'react';
      import { style, css$ } from '@vanilla-extract/css';

      const color = 'red';

      const myStyle = (display) => style({ display, color })

      const flex = css$(myStyle('flex'));

      export default () => \`<div class="\${flex}" />\``;

    const result = transform(source);

    expect(result.code).toMatchInlineSnapshot(/* tsx */ `
      import React from 'react';
      const flex = _vanilla_identifier_4_0;
      export default (() => \`<div class="\${flex}" />\`);
    `);

    expect(result.buildTimeCode).toMatchInlineSnapshot(/* tsx */ `
      import { style, css$ } from '@vanilla-extract/css';
      const color = 'red';
      const myStyle = display => style({
        display,
        color
      });
      export const _vanilla_identifier_4_0 = css$(myStyle('flex'));
      const flex = _vanilla_identifier_4_0;
      export default (() => \`<div class="\${flex}" />\`);
    `);
  });

  it('should retain required imports', () => {
    const source = /* tsx */ `
      import React from 'react';
      import polished from 'polished';
      import { style, css$ } from '@vanilla-extract/css';

      const myColorStyle = (color) => style({ color: polished.lighten(color) });
      const lightRed = css$(myColorStyle('red'));

      export default () => <div className={lightRed} />`;

    const result = transform(source);

    expect(result.code).toMatchInlineSnapshot(/* tsx */ `
      import React from 'react';
      const lightRed = _vanilla_identifier_4_0;
      export default (() => <div className={lightRed} />);
    `);

    expect(result.buildTimeCode).toMatchInlineSnapshot(/* tsx */ `
      import polished from 'polished';
      import { style, css$ } from '@vanilla-extract/css';
      const myColorStyle = color => style({
        color: polished.lighten(color)
      });
      export const _vanilla_identifier_4_0 = css$(myColorStyle('red'));
      const lightRed = _vanilla_identifier_4_0;
      export default (() => <div className={lightRed} />);
    `);
  });

  it('should retain mixed required imports', () => {
    const source = /* tsx */ `
      import { style, css$ } from '@vanilla-extract/css';
      import { brandVar, brand, BrandDetails } from './colors';

      const className = css$(style({
        vars: {
          [brandVar]: brand,
        },
        backgroundColor: brandVar,
      }))

      export const Component = () =>
        <BrandDetails className={className} />`;

    const result = transform(source);

    expect(result.code).toMatchInlineSnapshot(/* tsx */ `
      import { BrandDetails } from './colors';
      const className = _vanilla_identifier_2_0;
      export const Component = () => <BrandDetails className={className} />;
    `);

    expect(result.buildTimeCode).toMatchInlineSnapshot(/* tsx */ `
      import { style, css$ } from '@vanilla-extract/css';
      import { brandVar, brand, BrandDetails } from './colors';
      export const _vanilla_identifier_2_0 = css$(style({
        vars: {
          [brandVar]: brand
        },
        backgroundColor: brandVar
      }));
      const className = _vanilla_identifier_2_0;
      export const Component = () => <BrandDetails className={className} />;
    `);
  });

  it('should work inline as a classname', () => {
    const source = /* tsx */ `
      import { style, css$ } from '@vanilla-extract/css';

      export default () => <div className={css$(style({ display: 'flex' }))}>foo</div>;`;

    const result = transform(source);

    expect(result.code).toMatchInlineSnapshot(
      `export default (() => <div className={_vanilla_anonymousIdentifier_1_0}>foo</div>);`,
    );

    expect(result.buildTimeCode).toMatchInlineSnapshot(/* tsx */ `
      import { style, css$ } from '@vanilla-extract/css';
      export const _vanilla_anonymousIdentifier_1_0 = css$(style({
        display: 'flex'
      }));
      export default (() => <div className={_vanilla_anonymousIdentifier_1_0}>foo</div>);
    `);
  });

  it('should work inline as a named export', () => {
    const source = /* tsx */ `
      import { style, css$ } from '@vanilla-extract/css';

      export const myStyle = css$(style({ color: 'red' }));

      export const blue = css$(style({ color: 'blue' }));`;

    const result = transform(source);

    expect(result.code).toMatchInlineSnapshot(/* tsx */ `
      export const myStyle = _vanilla_identifier_1_0;
      export const blue = _vanilla_identifier_2_0;
    `);
    expect(result.buildTimeCode).toMatchInlineSnapshot(/* tsx */ `
      import { style, css$ } from '@vanilla-extract/css';
      export const _vanilla_identifier_1_0 = css$(style({
        color: 'red'
      }));
      export const myStyle = _vanilla_identifier_1_0;
      export const _vanilla_identifier_2_0 = css$(style({
        color: 'blue'
      }));
      export const blue = _vanilla_identifier_2_0;
    `);
  });

  it('should work inline as a default export', () => {
    const source = /* tsx */ `
      import { style, css$ } from '@vanilla-extract/css';

      export const myStyle = css$(style({ color: 'red' }));

      export default css$(style({ color: 'blue' }));`;

    const result = transform(source);

    expect(result.code).toMatchInlineSnapshot(/* tsx */ `
      export const myStyle = _vanilla_identifier_1_0;
      export default _vanilla_defaultIdentifer;
    `);
    expect(result.buildTimeCode).toMatchInlineSnapshot(/* tsx */ `
      import { style, css$ } from '@vanilla-extract/css';
      export const _vanilla_identifier_1_0 = css$(style({
        color: 'red'
      }));
      export const myStyle = _vanilla_identifier_1_0;
      export const _vanilla_defaultIdentifer = css$(style({
        color: 'blue'
      }));
      export default _vanilla_defaultIdentifer;
    `);
  });

  it('should support multiple macros', () => {
    const source = /* tsx */ `
      import { style, css$, style$ } from '@vanilla-extract/css';

      export const myStyle = css$(style({ color: 'red' }));

      export const myOtherStyle = style$({ color: 'green' });

      export default css$(style({ color: 'blue' }));`;

    const result = transform(source, ['css$', 'style$']);

    expect(result.code).toMatchInlineSnapshot(/* tsx */ `
      export const myStyle = _vanilla_identifier_1_0;
      export const myOtherStyle = _vanilla_identifier_2_0;
      export default _vanilla_defaultIdentifer;
    `);
    expect(result.buildTimeCode).toMatchInlineSnapshot(/* tsx */ `
      import { style, css$, style$ } from '@vanilla-extract/css';
      export const _vanilla_identifier_1_0 = css$(style({
        color: 'red'
      }));
      export const myStyle = _vanilla_identifier_1_0;
      export const _vanilla_identifier_2_0 = style$({
        color: 'green'
      });
      export const myOtherStyle = _vanilla_identifier_2_0;
      export const _vanilla_defaultIdentifer = css$(style({
        color: 'blue'
      }));
      export default _vanilla_defaultIdentifer;
    `);
  });

  it('should extract everything to build-time in a ".css.ts" file', () => {
    const source = /* tsx */ `
      import { style } from '@vanilla-extract/css';
      
      const flex = style({ display: 'flex' });
      export const red = style({ color: 'red' });

      export const redFlex = style([flex, red])

      export default style({ color: 'blue' });`;

    const result = transform(source, ['css$'], 'styles.css.ts');

    expect(result.code).toMatchInlineSnapshot(/* tsx */ `
      const flex = _vanilla_identifier_1_0;
      export const red = _vanilla_identifier_2_0;
      export const redFlex = _vanilla_identifier_3_0;
      export default _vanilla_defaultIdentifer;
    `);
    expect(result.buildTimeCode).toMatchInlineSnapshot(/* tsx */ `
      import { css$ } from "@vanilla-extract/css";
      import { style } from '@vanilla-extract/css';
      export const _vanilla_identifier_1_0 = css$(style({
        display: 'flex'
      }));
      const flex = _vanilla_identifier_1_0;
      export const _vanilla_identifier_2_0 = css$(style({
        color: 'red'
      }));
      export const red = _vanilla_identifier_2_0;
      export const _vanilla_identifier_3_0 = css$(style([flex, red]));
      export const redFlex = _vanilla_identifier_3_0;
      export const _vanilla_defaultIdentifer = css$(style({
        color: 'blue'
      }));
      export default _vanilla_defaultIdentifer;
    `);
  });

  it('should extract global APIs in a ".css.ts" file', () => {
    const source = /* tsx */ `
      import { globalStyle } from '@vanilla-extract/css';
      
      globalStyle(':root', { fontSize: '24px' });

      export const red = style({ color: 'red' });`;

    const result = transform(source, ['css$'], 'styles.css.ts');

    expect(result.code).toMatchInlineSnapshot(
      /* tsx */
      `export const red = _vanilla_identifier_2_0;`,
    );
    expect(result.buildTimeCode).toMatchInlineSnapshot(/* tsx */ `
      import { css$ } from "@vanilla-extract/css";
      import { globalStyle } from '@vanilla-extract/css';
      css$(globalStyle(':root', {
        fontSize: '24px'
      }));
      export const _vanilla_identifier_2_0 = css$(style({
        color: 'red'
      }));
      export const red = _vanilla_identifier_2_0;
    `);
  });
});
