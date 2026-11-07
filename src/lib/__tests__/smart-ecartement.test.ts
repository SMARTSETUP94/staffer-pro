import { describe, it, expect } from 'vitest';
import { doitEcarterSmart } from '../smart-ecartement';

const base = { source_boite: 'smart', categorie_ia: 'opportunite', statut: 'pending_review' };

describe('écartement des mails smart@', () => {
  it('écarte une demande smart@ en attente non traitée', () => {
    expect(doitEcarterSmart(base, false)).toBe(true);
  });
  it('ne touche pas une demande déjà rattachée', () => {
    expect(doitEcarterSmart({ ...base, opportunite_id: 'x' }, false)).toBe(false);
    expect(doitEcarterSmart({ ...base, client_id: 'x' }, false)).toBe(false);
  });
  it('ne touche pas une demande déjà validée', () => {
    expect(doitEcarterSmart({ ...base, statut: 'validated' }, false)).toBe(false);
  });
  it("n'écarte pas un mail confirmé reçu sur devis@", () => {
    expect(doitEcarterSmart(base, true)).toBe(false);
  });
  it('ne touche pas les candidatures', () => {
    expect(doitEcarterSmart({ ...base, categorie_ia: 'candidature' }, false)).toBe(false);
  });
});
