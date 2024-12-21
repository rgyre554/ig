const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { chromium } = require('playwright');

const BASE_URL_GET_ACTION = 'http://api.ganharnoinsta.com/get_action.php';
const BASE_URL_CONFIRM_ACTION = "http://api.ganharnoinsta.com/confirm_action.php";
const TOKEN = '98664a53-aad2-4189-ad45-82fbda6624e7';
const SHA1 = 'e5990261605cd152f26c7919192d4cd6f6e22227';

const cookieFile = process.argv[2];
if (!cookieFile) {
    console.error('Por favor, forneça o nome do arquivo de cookie como argumento.');
    process.exit(1);
}

async function loadCookies(context, filePath) {
    try {
        const resolvedPath = path.resolve('./cookies', path.basename(filePath));
        const cookies = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
        await context.addCookies(cookies);
    } catch (error) {
        console.error(`Erro ao carregar cookies de ${filePath}:`, error.message);
    }
}

async function testarLogin(TOKEN, SHA1, cookieFile) {
    console.log(`Iniciando login para ${cookieFile}`);
    const loginUrl = 'http://api.ganharnoinsta.com/login.php';
    const checkAccountUrl = 'http://api.ganharnoinsta.com/check_account.php';

    const loginDados = { token: TOKEN, sha1: SHA1 };

    try {
        const browser = await chromium.launch();
        const context = await browser.newContext({
        });

        await loadCookies(context, cookieFile);

        const loginResponse = await axios.post(loginUrl, loginDados, {
            headers: { 'Content-Type': 'application/json' }
        });

        const loginData = loginResponse.data;
        if (!loginData.SESSIONID) {
            throw new Error("Erro: SESSIONID não encontrado na resposta de login.");
        }

        console.log(`Login realizado com sucesso para ${cookieFile}. SESSIONID: ${loginData.SESSIONID}`);

        const checkAccountDados = {
            token: TOKEN,
            sha1: SHA1,
            SESSIONID: loginData.SESSIONID,
            nome_usuario: path.basename(cookieFile, '.json'),
            is_tiktok: "0",
            is_instagram: "1"
        };

        const checkAccountResponse = await axios.post(checkAccountUrl, checkAccountDados, {
            headers: { 'Content-Type': 'application/json' }
        });

        const accountData = checkAccountResponse.data;
        console.log(`Verificação da conta realizada para ${cookieFile}:`, accountData);

        if (accountData && accountData.id_conta) {
            const ID_CONTA = accountData.id_conta;
            console.log(`ID_CONTA encontrado para ${cookieFile}: ${ID_CONTA}`);

            let actionFound = false;
            let attempts = 0;
            const maxAttempts = 999;
            let delay = 2000;

            console.log('Buscando ação de seguir...');

            while (!actionFound && attempts < maxAttempts) {
                attempts++;

                const getActionDados = {
                    token: TOKEN,
                    sha1: SHA1,
                    id_conta: ID_CONTA,
                    tipo_acao: "3"
                };

                const getActionResponse = await axios.post(BASE_URL_GET_ACTION, getActionDados, {
                    headers: { 'Content-Type': 'application/json' }
                });

                const actionData = getActionResponse.data;

                if (actionData.status === 'ENCONTRADA') {
                    if (actionData.tipo_acao === 'seguir' && actionData.id_pedido) {
                        const ID_PEDIDO = actionData.id_pedido;
                        const profileUrl = actionData.url;
                        console.log(`Ação de seguir encontrada. ID_PEDIDO: ${ID_PEDIDO} para ${cookieFile}`);

                        const confirmActionDados = {
                            token: TOKEN,
                            sha1: SHA1,
                            id_pedido: ID_PEDIDO,
                            id_conta: ID_CONTA
                        };

                        const confirmActionResponse = await axios.post(BASE_URL_CONFIRM_ACTION, confirmActionDados, {
                            headers: { 'Content-Type': 'application/json' }
                        });

                        console.log(`Confirmação da ação de seguir para ${cookieFile}:`, confirmActionResponse.data);

                        const page = await context.newPage();
                        await page.goto(profileUrl);
                        console.log(`Abrindo navegador para seguir o perfil: ${profileUrl}`);
                        console.log("Aguardando 3 horas...");
                        await page.waitForTimeout(3600000 * 3);
                        await page.keyboard.press('Tab');
                        await page.keyboard.press('Tab');
                        await page.keyboard.press('Tab');
                        await page.keyboard.press('Enter');

                        console.log(`Ação de seguir realizada para ${cookieFile} no perfil ${profileUrl}`);

                        await page.close();
                        actionFound = true;
                    } else {
                        console.log(`Ação de curtir encontrada e ignorada. Detalhes: ${actionData}`);
                    }
                }

                delay += 0;
                await new Promise(resolve => setTimeout(resolve, delay));
            }

            if (!actionFound) {
                console.error(`Não foi possível encontrar uma ação de seguir válida para ${cookieFile} após ${attempts} tentativas.`);
            }

            await browser.close();
        } else {
            throw new Error(`Erro: ID_CONTA não encontrado para ${cookieFile}.`);
        }
    } catch (error) {
        console.error(`Erro na requisição para ${cookieFile}:`, error.response ? error.response.data : error.message);
    }
}

async function main() {
    console.log(`Iniciando script para: ${cookieFile}`);
    await testarLogin(TOKEN, SHA1, cookieFile);
}

main().catch(console.error);
