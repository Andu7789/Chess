export interface BoardTheme {
  id: string;
  name: string;
  light: string;
  dark: string;
  frame: string;
  label: string;
  whitePiece: string;
  blackPiece: string;
  table: string;
}

export const BOARD_THEMES: BoardTheme[] = [
  {
    id: 'walnut',
    name: 'Walnut',
    light: '#e8d3ae',
    dark: '#9a6640',
    frame: '#4a2c1a',
    label: '#e8d3ae',
    whitePiece: '#f4ead8',
    blackPiece: '#2b211c',
    table: '#1b1512',
  },
  {
    id: 'tournament',
    name: 'Tournament',
    light: '#eeeed2',
    dark: '#6f9a55',
    frame: '#2f3b29',
    label: '#eeeed2',
    whitePiece: '#f6f2e8',
    blackPiece: '#262626',
    table: '#141a13',
  },
  {
    id: 'marble',
    name: 'Marble',
    light: '#e6e4df',
    dark: '#6d7a86',
    frame: '#2c323a',
    label: '#e6e4df',
    whitePiece: '#fbfaf6',
    blackPiece: '#1f2328',
    table: '#101317',
  },
  {
    id: 'ocean',
    name: 'Ocean',
    light: '#dbe9f2',
    dark: '#4f7ea3',
    frame: '#1d3448',
    label: '#dbe9f2',
    whitePiece: '#f3efe6',
    blackPiece: '#1c2630',
    table: '#0c1620',
  },
];

export function getTheme(id: string): BoardTheme {
  return BOARD_THEMES.find((t) => t.id === id) ?? BOARD_THEMES[0];
}
