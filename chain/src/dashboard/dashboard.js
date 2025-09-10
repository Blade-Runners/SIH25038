let currentUser = null;
let sessionId = null;
let updateInterval = null;

document.addEventListener('DOMContentLoaded', function() {
    updateDashboard();
    startAutoUpdate();
});

async function register() {
    const username = document.getElementById('registerUsername').value;
    const password = document.getElementById('registerPassword').value;

    if (!username || !password) {
        showLog('Please fill in all fields', 'error');
        return;
    }

    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (response.ok) {
            showLog(`User ${username} registered successfully!`, 'success');
            showLogin();
            document.getElementById('registerUsername').value = '';
            document.getElementById('registerPassword').value = '';
        } else {
            showLog(data.error || 'Registration failed', 'error');
        }
    } catch (error) {
        showLog('Network error during registration', 'error');
    }
}

async function login() {
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;

    if (!username || !password) {
        showLog('Please fill in all fields', 'error');
        return;
    }

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (response.ok) {
            currentUser = data.user;
            sessionId = data.sessionId;
            showUserInfo();
            enableUserActions();
            showLog(`Welcome back, ${username}!`, 'success');
            updateUserBalance();
        } else {
            showLog(data.error || 'Login failed', 'error');
        }
    } catch (error) {
        showLog('Network error during login', 'error');
    }
}

async function logout() {
    try {
        if (sessionId) {
            await fetch('/api/logout', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${sessionId}` }
            });
        }

        currentUser = null;
        sessionId = null;
        showLogin();
        disableUserActions();
        showLog('Logged out successfully', 'info');
    } catch (error) {
        showLog('Error during logout', 'error');
    }
}

function showLogin() {
    document.getElementById('loginForm').classList.remove('hidden');
    document.getElementById('registerForm').classList.add('hidden');
    document.getElementById('userInfo').classList.add('hidden');
}

function showRegister() {
    document.getElementById('loginForm').classList.add('hidden');
    document.getElementById('registerForm').classList.remove('hidden');
    document.getElementById('userInfo').classList.add('hidden');
}

function showUserInfo() {
    document.getElementById('loginForm').classList.add('hidden');
    document.getElementById('registerForm').classList.add('hidden');
    document.getElementById('userInfo').classList.remove('hidden');
    
    document.getElementById('currentUser').textContent = currentUser.username;
    document.getElementById('userAddress').textContent = currentUser.address.substring(0, 20) + '...';
}

function enableUserActions() {
    document.getElementById('sendTxBtn').disabled = false;
    document.getElementById('mineBtn').disabled = false;
    document.getElementById('deployBtn').disabled = false;
}

function disableUserActions() {
    document.getElementById('sendTxBtn').disabled = true;
    document.getElementById('mineBtn').disabled = true;
    document.getElementById('deployBtn').disabled = true;
}

// Dashboard update functions
async function updateDashboard() {
    await Promise.all([
        updateStats(),
        updateBlocks(),
        updatePeers(),
        updateUsers(),
        updateTransactions(),
        updateUserBalance()
    ]);
}

async function updateStats() {
    try {
        const response = await fetch('/api/stats');
        const stats = await response.json();

        document.getElementById('totalBlocks').textContent = stats.totalBlocks;
        document.getElementById('totalUsers').textContent = stats.totalUsers;
        document.getElementById('totalPeers').textContent = stats.totalPeers;
        document.getElementById('pendingTx').textContent = stats.pendingTransactions;
    } catch (error) {
        console.error('Failed to update stats:', error);
    }
}

async function updateBlocks() {
    try {
        const response = await fetch('/api/blockchain');
        const blocks = await response.json();

        const blockList = document.getElementById('blockList');
        blockList.innerHTML = '';

        blocks.slice(-5).reverse().forEach(block => {
            const blockDiv = document.createElement('div');
            blockDiv.className = 'list-item';
            blockDiv.innerHTML = `
                <strong>Block #${block.index}</strong><br>
                Hash: ${block.hash.substring(0, 20)}...<br>
                Transactions: ${block.transactions.length}<br>
                <small>${new Date(block.timestamp).toLocaleString()}</small>
            `;
            blockList.appendChild(blockDiv);
        });
    } catch (error) {
        console.error('Failed to update blocks:', error);
    }
}

async function updatePeers() {
    try {
        const response = await fetch('/api/peers');
        const peers = await response.json();

        const peerList = document.getElementById('peerList');
        peerList.innerHTML = '';

        peers.forEach(peer => {
            const peerDiv = document.createElement('div');
            peerDiv.className = 'list-item';
            peerDiv.innerHTML = `
                <strong>${peer.host}:${peer.port}</strong><br>
                Status: ${peer.isConnected ? 'Connected' : 'Disconnected'}<br>
                <small>Last seen: ${new Date(peer.lastSeen).toLocaleString()}</small>
            `;
            peerList.appendChild(peerDiv);
        });

        if (peers.length === 0) {
            peerList.innerHTML = '<div class="list-item">No active peers</div>';
        }
    } catch (error) {
        console.error('Failed to update peers:', error);
    }
}

async function updateUsers() {
    try {
        const response = await fetch('/api/users');
        const users = await response.json();

        const userList = document.getElementById('userList');
        userList.innerHTML = '';

        users.slice(-5).reverse().forEach(user => {
            const userDiv = document.createElement('div');
            userDiv.className = 'list-item';
            userDiv.innerHTML = `
                <strong>${user.username}</strong><br>
                Address: ${user.address.substring(0, 20)}...<br>
                <small>Registered: ${new Date(user.registeredAt).toLocaleString()}</small>
            `;
            userList.appendChild(userDiv);
        });
    } catch (error) {
        console.error('Failed to update users:', error);
    }
}

async function updateTransactions() {
    try {
        const response = await fetch('/api/transactions/pending');
        const transactions = await response.json();

        const txList = document.getElementById('txList');
        txList.innerHTML = '';

        transactions.slice(-5).reverse().forEach(tx => {
            const txDiv = document.createElement('div');
            txDiv.className = 'list-item';
            txDiv.innerHTML = `
                <strong>${tx.amount} XBC</strong><br>
                From: ${tx.fromAddress ? tx.fromAddress.substring(0, 15) + '...' : 'Mining Reward'}<br>
                To: ${tx.toAddress.substring(0, 15)}...<br>
                <small>${new Date(tx.timestamp).toLocaleString()}</small>
            `;
            txList.appendChild(txDiv);
        });

        if (transactions.length === 0) {
            txList.innerHTML = '<div class="list-item">No pending transactions</div>';
        }
    } catch (error) {
        console.error('Failed to update transactions:', error);
    }
}

async function updateUserBalance() {
    if (!currentUser) return;

    try {
        const response = await fetch(`/api/balance?address=${currentUser.address}`);
        const data = await response.json();
        
        document.getElementById('userBalance').textContent = data.balance;
    } catch (error) {
        console.error('Failed to update balance:', error);
    }
}

// Action functions
async function sendTransaction() {
    const toAddress = document.getElementById('toAddress').value;
    const amount = parseFloat(document.getElementById('amount').value);

    if (!toAddress || !amount || amount <= 0) {
        showLog('Please fill in valid recipient address and amount', 'error');
        return;
    }

    try {
        const response = await fetch('/api/transaction', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sessionId}`
            },
            body: JSON.stringify({ toAddress, amount })
        });

        const data = await response.json();

        if (response.ok) {
            showLog(`Transaction sent successfully! Amount: ${amount} XBC`, 'success');
            document.getElementById('toAddress').value = '';
            document.getElementById('amount').value = '';
            updateDashboard();
        } else {
            showLog(data.error || 'Transaction failed', 'error');
        }
    } catch (error) {
        showLog('Network error during transaction', 'error');
    }
}

async function mineBlock() {
    const mineBtn = document.getElementById('mineBtn');
    const miningStatus = document.getElementById('miningStatus');
    
    mineBtn.disabled = true;
    miningStatus.textContent = 'Mining in progress...';

    try {
        const response = await fetch('/api/mine', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${sessionId}` }
        });

        const data = await response.json();

        if (response.ok) {
            showLog('Block mined successfully! You earned mining rewards.', 'success');
            miningStatus.textContent = 'Block mined!';
            updateDashboard();
        } else {
            showLog(data.error || 'Mining failed', 'error');
            miningStatus.textContent = 'Mining failed';
        }
    } catch (error) {
        showLog('Network error during mining', 'error');
        miningStatus.textContent = 'Mining error';
    } finally {
        mineBtn.disabled = false;
        setTimeout(() => {
            miningStatus.textContent = '';
        }, 3000);
    }
}

async function connectPeer() {
    const host = document.getElementById('peerHost').value;
    const port = parseInt(document.getElementById('peerPort').value);

    if (!host || !port) {
        showLog('Please fill in peer host and port', 'error');
        return;
    }

    try {
        const response = await fetch('/api/peers/connect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ host, port })
        });

        const data = await response.json();

        if (response.ok) {
            showLog(`Connection initiated to ${host}:${port}`, 'success');
            updatePeers();
        } else {
            showLog(data.error || 'Connection failed', 'error');
        }
    } catch (error) {
        showLog('Network error during peer connection', 'error');
    }
}

async function deployContract() {
    const code = document.getElementById('contractCode').value;
    const contractStatus = document.getElementById('contractStatus');

    if (!code) {
        showLog('Please enter contract code', 'error');
        return;
    }

    try {
        const response = await fetch('/api/contract/deploy', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sessionId}`
            },
            body: JSON.stringify({ code })
        });

        const data = await response.json();

        if (response.ok) {
            showLog(`Smart contract deployed! Address: ${data.contractAddress}`, 'success');
            contractStatus.textContent = `Contract deployed at: ${data.contractAddress}`;
            document.getElementById('contractCode').value = '';
        } else {
            showLog(data.error || 'Contract deployment failed', 'error');
            contractStatus.textContent = 'Deployment failed';
        }
    } catch (error) {
        showLog('Network error during contract deployment', 'error');
        contractStatus.textContent = 'Deployment error';
    }
}

function showLog(message, type = 'info') {
    const logContainer = document.getElementById('activityLog');
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${type}`;
    logEntry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    
    logContainer.appendChild(logEntry);
    logContainer.scrollTop = logContainer.scrollHeight;

    while (logContainer.children.length > 50) {
        logContainer.removeChild(logContainer.firstChild);
    }
}

function startAutoUpdate() {
    updateInterval = setInterval(updateDashboard, 10000);
}

function stopAutoUpdate() {
    if (updateInterval) {
        clearInterval(updateInterval);
    }
}

window.addEventListener('beforeunload', stopAutoUpdate);
