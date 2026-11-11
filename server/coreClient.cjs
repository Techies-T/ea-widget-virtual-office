const DEFAULT_EA_CORE_URL = (process.env.EA_CORE_INTERNAL_URL || 'http://localhost:3000').replace(/\/$/, '');

async function callCoreHostApi(endpointPath, agentToken, { method = 'GET', body = undefined, hostUrl = '' } = {}) {
    const baseUrl = (hostUrl || DEFAULT_EA_CORE_URL).replace(/\/$/, '');
    const headers = {
        Authorization: `Bearer ${agentToken}`
    };
    if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(`${baseUrl}/api/core/host${endpointPath}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined
    });

    if (!res.ok) {
        const errPayload = await res.json().catch(() => ({}));
        const err = new Error(errPayload.error || `Core Host API ${endpointPath} returned HTTP ${res.status}`);
        err.status = res.status;
        throw err;
    }

    return res.json();
}

async function fetchCoreUsers(agentToken, hostUrl) {
    const data = await callCoreHostApi('/users', agentToken, { hostUrl });
    return Array.isArray(data.users) ? data.users : [];
}

async function updateCoreUserAvatar(agentToken, userId, avatarUrl, hostUrl) {
    return callCoreHostApi('/users/avatar', agentToken, {
        method: 'POST',
        body: { userId, avatarUrl },
        hostUrl
    });
}

async function fetchAssistantDefaults(agentToken, hostUrl) {
    return callCoreHostApi('/settings/assistant-defaults', agentToken, { hostUrl });
}

async function checkWorkPolicyCompliance(agentToken, promptText, hostUrl) {
    return callCoreHostApi('/ai/compliance-check', agentToken, {
        method: 'POST',
        body: { promptText },
        hostUrl
    });
}

async function translateViaCore(agentToken, { text, senderLangName, targetLangName }, hostUrl) {
    return callCoreHostApi('/ai/translate', agentToken, {
        method: 'POST',
        body: { text, senderLangName, targetLangName },
        hostUrl
    });
}

async function generateAssistantReplyViaCore(agentToken, payload, hostUrl) {
    return callCoreHostApi('/ai/assistant-reply', agentToken, {
        method: 'POST',
        body: payload,
        hostUrl
    });
}

async function fetchCommonFreeSlots(agentToken, targetEmail, settings, hostUrl) {
    return callCoreHostApi('/calendar/free-slots', agentToken, {
        method: 'POST',
        body: { targetEmail, settings },
        hostUrl
    });
}

async function createCalendarEvent(agentToken, eventBody, hostUrl) {
    return callCoreHostApi('/calendar/events', agentToken, {
        method: 'POST',
        body: eventBody,
        hostUrl
    });
}

async function logCoreAudit(agentToken, auditBody, hostUrl) {
    try {
        await callCoreHostApi('/audit', agentToken, {
            method: 'POST',
            body: auditBody,
            hostUrl
        });
    } catch (err) {
        console.error('[VirtualOffice CoreClient] Audit log forward failed:', err.message);
    }
}

module.exports = {
    DEFAULT_EA_CORE_URL,
    fetchCoreUsers,
    updateCoreUserAvatar,
    fetchAssistantDefaults,
    checkWorkPolicyCompliance,
    translateViaCore,
    generateAssistantReplyViaCore,
    fetchCommonFreeSlots,
    createCalendarEvent,
    logCoreAudit
};
