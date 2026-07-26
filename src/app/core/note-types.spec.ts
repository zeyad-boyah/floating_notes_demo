import { acceptedChildTypes, canAttach } from './note-types';

describe('canAttach', () => {
  it('lets a theme sit on the board but not inside anything', () => {
    expect(canAttach('theme', null)).toBe(true);
    expect(canAttach('theme', 'theme')).toBe(false);
    expect(canAttach('theme', 'idea')).toBe(false);
  });

  it('keeps non-root types off the board', () => {
    expect(canAttach('idea', null)).toBe(false);
    expect(canAttach('action', null)).toBe(false);
  });

  it('follows the declared parent rules', () => {
    expect(canAttach('idea', 'theme')).toBe(true);
    expect(canAttach('idea', 'idea')).toBe(false);
    expect(canAttach('action', 'idea')).toBe(true);
    expect(canAttach('action', 'theme')).toBe(false);
    expect(canAttach('question', 'idea')).toBe(true);
  });

  it('rejects unknown types on either side', () => {
    expect(canAttach('nope', 'theme')).toBe(false);
    expect(canAttach('idea', 'nope')).toBe(false);
  });

  it('reports which children a type accepts', () => {
    expect(acceptedChildTypes('theme').map((t) => t.id)).toEqual(['idea']);
    expect(acceptedChildTypes('idea').map((t) => t.id)).toEqual(['action', 'question']);
    expect(acceptedChildTypes('action')).toEqual([]);
  });
});
