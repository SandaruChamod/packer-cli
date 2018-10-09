import { conf } from './replace-config';

describe('Base configuration test suite', () => {
  it('Title is required', () => {
      expect(conf.title).toBe('Packer CLI');
  });

  it('Config type should be BASE', () => {
    expect(conf.configType).toBe('BASE');
  });
});