import request from 'supertest';
import { jest, describe, it, expect, beforeAll, afterAll } from '@jest/globals';

// Set env vars BEFORE importing app
process.env.AUTH_ENABLED = 'false';
process.env.PERSONIO_CLIENT_ID = '';
process.env.PERSONIO_CLIENT_SECRET = '';

// We expect the app to run in plain demo mode since no env vars are set in test environment
describe('API Endpoints (Demo Mode)', () => {
    let app;

    beforeAll(async () => {
        // Suppress console logs during tests to keep output clean
        jest.spyOn(console, 'log').mockImplementation(() => { });
        jest.spyOn(console, 'warn').mockImplementation(() => { });

        // Dynamic import to ensure env vars are applied
        const mod = await import('../server.js');
        app = mod.default;
    });

    afterAll(() => {
        jest.restoreAllMocks();
    });

    it('GET /api/employees returns mock employees', async () => {
        const res = await request(app).get('/api/employees');
        expect(res.statusCode).toEqual(200);
        expect(res.body).toHaveProperty('data');
        expect(Array.isArray(res.body.data)).toBe(true);
        expect(res.body.data.length).toBeGreaterThan(0);
        // Check for a specific mock user we know exists
        const alice = res.body.data.find(e => e.attributes.email.value === 'alice@example.com');
        expect(alice).toBeDefined();
    });

    it('GET /api/time-off-types returns mock types', async () => {
        const res = await request(app).get('/api/time-off-types');
        expect(res.statusCode).toEqual(200);
        expect(Array.isArray(res.body.data)).toBe(true);
        expect(res.body.data.some(t => t.attributes.name === 'Paid Vacation')).toBe(true);
    });

    it('GET /api/absences returns mock absences', async () => {
        // Must provide query params
        const res = await request(app).get('/api/absences?start_date=2024-01-01&end_date=2024-01-31');
        expect(res.statusCode).toEqual(200);
        expect(res.body).toHaveProperty('data');
        expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('GET /api/absences returns 400 if dates missing', async () => {
        const res = await request(app).get('/api/absences');
        expect(res.statusCode).toEqual(400);
    });
});
