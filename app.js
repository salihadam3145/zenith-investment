// 1. الإعدادات وعنوان العقد
const CONTRACT_ADDRESS = "0x0484c454168B9c48073b12cE21c0B0A049A43c40";
const ABI = [
    "function invest(address referrer, uint256 plan) external payable",
    "function withdraw() external",
    "function users(address) view returns (address, uint256, uint256, uint256, uint256, uint256)",
    "function deposits(address, uint256) view returns (uint256 amount, uint256 start, uint256 plan, bool withdrawn)",
    "function plans(uint256) view returns (uint256 duration, uint256 percent)",
    "function getUserDownlineCount(address, uint256) view returns (uint256)",
    "function getUserDownlineInvestment(address, uint256) view returns (uint256)"
];

// نسب العمولات لـ 25 جيل
const refPercents = [20, 10, 5, 2, 2, 2, 1, 1, 1, 1, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.25, 0.25, 0.25, 0.25, 1];

let provider, signer, contract, userAddress;
let currentLang = 'ar';

// 2. وظيفة الربط بالمحفظة
async function connect() {
    if (window.ethereum) {
        try {
            provider = new ethers.BrowserProvider(window.ethereum);
            await provider.send("eth_requestAccounts", []);
            signer = await provider.getSigner();
            userAddress = await signer.getAddress();
            contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);

            // تحديث الواجهة فوراً
            document.getElementById('connectBtn').innerText = userAddress.substring(0, 6) + "..." + userAddress.substring(38);
            document.getElementById('refLink').innerText = window.location.origin + window.location.pathname + "?ref=" + userAddress;

            // تشغيل العداد وتحديث البيانات كل ثانية
            renderPlans();
            loadTeamData();
            setInterval(updateUI, 1000); 
            
        } catch (error) {
            console.error("Connection error:", error);
        }
    } else {
        alert(currentLang === 'ar' ? "يرجى استخدام MetaMask" : "Please use MetaMask");
    }
}

// 3. تحديث البيانات والعداد الزمني (أهم جزء)
async function updateUI() {
    if (!contract || !userAddress) return;

    try {
        // جلب بيانات العقد والمستخدم
        const userData = await contract.users(userAddress);
        const contractBal = await provider.getBalance(CONTRACT_ADDRESS);

        document.getElementById('contractBalance').innerText = parseFloat(ethers.formatEther(contractBal)).toFixed(3) + " BNB";
        document.getElementById('totalInvested').innerText = parseFloat(ethers.formatEther(userData[1])).toFixed(4) + " BNB";
        document.getElementById('rewardBalance').innerText = parseFloat(ethers.formatEther(userData[2])).toFixed(4) + " BNB";

        // معالجة قائمة الإيداعات والعدادات
        let depHTML = "";
        for (let i = 0; i < 20; i++) { // فحص أول 20 إيداع
            try {
                const dep = await contract.deposits(userAddress, i);
                if (dep.amount === 0n) break; 
                if (dep.withdrawn) continue;

                const plan = await contract.plans(dep.plan);
                const totalWithProfit = dep.amount + (dep.amount * plan.percent / 100n);
                
                // حساب الوقت المتبقي بدقة
                const finishTime = Number(dep.start) + Number(plan.duration);
                const now = Math.floor(Date.now() / 1000);
                const diff = finishTime - now;

                let timerText = "";
                if (diff > 0) {
                    const d = Math.floor(diff / 86400);
                    const h = Math.floor((diff % 86400) / 3600);
                    const m = Math.floor((diff % 3600) / 60);
                    const s = diff % 60;
                    timerText = `<span class="countdown">${d}d ${h}h ${m}m ${s}s</span>`;
                } else {
                    timerText = `<span class="ready-text">${currentLang === 'ar' ? 'جاهز ✅' : 'Ready ✅'}</span>`;
                }

                depHTML += `
                <tr>
                    <td>${parseFloat(ethers.formatEther(totalWithProfit)).toFixed(4)}</td>
                    <td>${Number(plan.duration) / 86400} ${currentLang === 'ar' ? 'يوم' : 'Days'}</td>
                    <td>${timerText}</td>
                </tr>`;
            } catch (e) { break; }
        }
        document.getElementById('depositsContainer').innerHTML = depHTML || `<tr><td colspan="3">...</td></tr>`;

    } catch (e) { console.error("Update Error:", e); }
}

// 4. عرض خطط الاستثمار
function renderPlans() {
    const plans = [
        { id: 0, days: 1, perc: 110, def: 0.05 },
        { id: 1, days: 7, perc: 130, def: 0.1 },
        { id: 2, days: 14, perc: 160, def: 0.5 },
        { id: 3, days: 28, perc: 200, def: 1.0 }
    ];

    let html = "";
    plans.forEach(p => {
        html += `
        <div class="card">
            <h4>${p.days} ${currentLang === 'ar' ? 'يوم' : 'Days'}</h4>
            <h3 class="yellow">${p.perc}%</h3>
            <input type="number" id="amt${p.id}" value="${p.def}" step="0.01">
            <button onclick="invest(${p.id})" class="btn btn-invest">${currentLang === 'ar' ? 'استثمار' : 'Invest'}</button>
        </div>`;
    });
    document.getElementById('plans-container').innerHTML = html;
}

// 5. جلب بيانات الفريق (25 جيل)
async function loadTeamData() {
    if (!contract || !userAddress) return;
    let html = "";
    for (let i = 0; i < 25; i++) {
        try {
            const count = await contract.getUserDownlineCount(userAddress, i);
            const inv = await contract.getUserDownlineInvestment(userAddress, i);
            html += `
            <tr>
                <td>${currentLang === 'ar' ? 'جيل' : 'Lvl'} ${i + 1}</td>
                <td>${count}</td>
                <td>${parseFloat(ethers.formatEther(inv)).toFixed(2)}</td>
                <td class="yellow">${refPercents[i]}%</td>
            </tr>`;
        } catch (e) { break; }
    }
    document.getElementById('teamLevelsBody').innerHTML = html;
}

// 6. العمليات (استثمار، سحب، نسخ)
async function invest(pid) {
    if (!contract) return alert("Connect Wallet!");
    const val = document.getElementById(`amt${pid}`).value;
    const ref = new URLSearchParams(window.location.search).get('ref') || "0x0000000000000000000000000000000000000000";
    try {
        const tx = await contract.invest(ref, pid, { value: ethers.parseEther(val) });
        await tx.wait();
        location.reload();
    } catch (e) { alert("Transaction Failed"); }
}

async function withdraw() {
    try {
        const tx = await contract.withdraw();
        await tx.wait();
        location.reload();
    } catch (e) { alert("No rewards available"); }
}

function copyRef() {
    navigator.clipboard.writeText(document.getElementById('refLink').innerText);
    alert(currentLang === 'ar' ? "تم النسخ!" : "Copied!");
}

// 7. نظام اللغات
function toggleLanguage() {
    currentLang = currentLang === 'ar' ? 'en' : 'ar';
    const html = document.getElementById('htmlPage');
    html.dir = currentLang === 'ar' ? 'rtl' : 'ltr';
    html.lang = currentLang;
    document.querySelectorAll('[data-ar]').forEach(el => {
        el.innerText = el.getAttribute(`data-${currentLang}`);
    });
    renderPlans();
    if (userAddress) loadTeamData();
}

// تشغيل عند التحميل
window.onload = renderPlans;
