import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { SIGQL_ENDPOINT, SIGQL_CONFIG, provideSigql } from './provider';

describe('provideSigql', () => {
  it('provides SIGQL_ENDPOINT with the given URL', () => {
    TestBed.configureTestingModule({
      providers: [provideSigql('http://localhost:4000/graphql')],
    });
    expect(TestBed.inject(SIGQL_ENDPOINT)).toBe('http://localhost:4000/graphql');
  });

  it('provides SIGQL_CONFIG with default empty object', () => {
    TestBed.configureTestingModule({
      providers: [provideSigql('http://localhost:4000/graphql')],
    });
    expect(TestBed.inject(SIGQL_CONFIG)).toEqual({});
  });

  it('provides SIGQL_CONFIG with the supplied config', () => {
    TestBed.configureTestingModule({
      providers: [provideSigql('http://localhost:4000/graphql', { operationNameParam: 'op' })],
    });
    expect(TestBed.inject(SIGQL_CONFIG)).toEqual({ operationNameParam: 'op' });
  });
});
