import {renderMemoryContentForModel} from '../memoryNormalization';

describe('memory model rendering', () => {
  it('resolves a possessive relationship to the current user', () => {
    expect(renderMemoryContentForModel('Harry ist mein Freund.')).toBe(
      'Harry ist Freund des aktuellen Benutzers.',
    );
  });

  it('resolves a first-person subject to the current user', () => {
    expect(renderMemoryContentForModel('Ich mag starken Kaffee.')).toBe(
      'Der aktuelle Benutzer mag starken Kaffee.',
    );
  });

  it('resolves a leading possessive to the current user', () => {
    expect(renderMemoryContentForModel('Mein Hund heißt Milow.')).toBe(
      'Hund des aktuellen Benutzers heißt Milow.',
    );
  });
});
