import { createHighlighterCore } from 'shiki/core';
import { languages } from './languages';
import { engine } from './oniguruma-engine-workerd';
import { themes } from './themes';

export const highlighter = await createHighlighterCore({
  themes,
  langs: languages,
  engine,
});
