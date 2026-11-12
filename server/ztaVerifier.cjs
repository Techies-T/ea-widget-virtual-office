const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

// Load plugin-local .env if present; in colocated local dev also load EA-Core's server/development.env
dotenv.config();
if (fs.existsSync("/app/data/development.env")) {
    dotenv.config({ path: "/app/data/development.env", override: false });
}
const colocatedDevEnv = path.resolve(__dirname, '../../EmployeeAgent-Core/server/development.env');
if (process.env.NODE_ENV !== 'production' && fs.existsSync(colocatedDevEnv)) {
    dotenv.config({ path: colocatedDevEnv, override: false });
}

const LEVEL_RANK = { none: 0, read: 1, execute: 2, manage: 3 };

function getJwtSecret() {
    return process.env.EA_CORE_JWT_SECRET || process.env.JWT_SECRET || 'secret';
}

function requireZtaAgentAuth(minLevel = 'read') {
    const requiredRank = LEVEL_RANK[minLevel] ?? LEVEL_RANK.read;

    return (req, res, next) => {
        const authHeader = req.headers.authorization || '';
        if (!authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'ZTA Authentication Required: Missing Bearer Agent JWT' });
        }

        const token = authHeader.substring(7);
        try {
            const decoded = jwt.verify(token, getJwtSecret());
            if (decoded.type !== 'agent_token') {
                return res.status(403).json({ error: 'ZTA Policy Denied: agent_token required' });
            }

            const audWidget = String(decoded.widgetId || decoded.aud || '').replace(/^app:/, '');
            if (audWidget !== 'virtual-office') {
                return res.status(403).json({
                    error: `ZTA Audience Mismatch: token issued for '${audWidget}', expected 'virtual-office'`
                });
            }

            const rank = LEVEL_RANK[decoded.widget_level] ?? LEVEL_RANK.execute;
            if (rank < requiredRank) {
                return res.status(403).json({
                    error: `ZTA Policy Denied: requires '${minLevel}' permission (current: '${decoded.widget_level || 'none'}')`
                });
            }

            req.agentToken = token;
            req.eaHostUrl = req.headers['x-ea-host-url'] || process.env.EA_CORE_INTERNAL_URL || '';
            req.agentAuth = {
                ...decoded,
                levelRank: rank
            };
            req.user = {
                id: Number(decoded.userId || decoded.sub),
                email: decoded.email,
                name: decoded.name,
                role: decoded.role,
                allowed_actions: Array.isArray(decoded.allowed_actions) ? decoded.allowed_actions : [],
                native_language: decoded.native_language || 'ja'
            };

            next();
        } catch (err) {
            return res.status(401).json({
                error: 'Invalid or expired ZTA Agent JWT',
                details: err.message
            });
        }
    };
}

module.exports = {
    LEVEL_RANK,
    requireZtaAgentAuth
};
