--[[
	PALCO DE AURAS + PONTE TIKBLOX

	Sua ponte TikBlox (servidor próprio com segredo) agora alimenta o palco
	com VÁRIOS dançarinos um do lado do outro, câmera que desliza e
	contador de AURA para cada skin.

	COMO FUNCIONA:
	  1. O script pergunta ao SEU servidor TikBlox (BRIDGE_URL) quem é o
	     próximo da fila (GET /api/roblox/next)
	  2. O servidor responde com { id, userId, name } da pessoa que comentou
	  3. O avatar REAL dela aparece no palco, um do lado do outro, dançando
	  4. A câmera desliza para o lado a cada novo dançarino (feito no client)
	  5. Cada skin ganha AURA por segundo (painel na tela + etiqueta 3D)
	  6. Quando o dançarino sai do palco, o script avisa o servidor (POST /complete)

	IMPORTANTE:
	  - Ative "Allow HTTP Requests" em Game Settings > Security
	  - Troque BRIDGE_URL pelo endereço real do seu servidor TikBlox
	  - O BRIDGE_TOKEN precisa ser IGUAL ao segredo do arquivo .env do servidor

	Comandos de teste no chat:
	  !dancar NickDaPessoa   -> coloca alguém no palco (busca pelo nick)
	  !fila                 -> mostra quantos estão na fila
	  !limpar               -> remove todos do palco
]]

local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

-- ===================== CONFIG DA PONTE TIKBLOX =====================
local BRIDGE_URL = "https://even-allen-symphony-genre.trycloudflare.com/api/roblox"
local BRIDGE_TOKEN = "FELIPE12345" -- o MESMO segredo do .env do seu servidor
local POLL_INTERVAL_SECONDS = 3

-- ===================== CONFIG DO PALCO =====================
local ESPACO = 8             -- distância entre dançarinos (studs)
local POR_FILEIRA = 5        -- quantos dançarinos por fileira (depois abre outra na frente)
local MAX_DANCARINOS = 20   -- máximo no palco (o mais antigo sai quando chega um novo)
local AURA_MAX = 10        -- aura final aleatória de 0 a 10 (pode ter decimal, ex: 7,3)

local arena = workspace:FindFirstChild("ArenaEleicao")
local BASE = Vector3.new(0, 3.5, 0) -- centro da primeira fileira
local dancarinos = {}  -- { model, requestId } em ordem de entrada
local fila = {}         -- pedidos aguardando para subir no palco

-- calcula a posição de um slot na grade de fileiras
-- fileira 1 (slots 1-5) fica atrás; fileira 2 (slots 6-10) na frente dela; etc.
local function posicaoDoSlot(slot)
	local fileira = math.floor((slot - 1) / POR_FILEIRA) + 1 -- 1, 2, 3...
	local coluna = (slot - 1) % POR_FILEIRA + 1             -- 1 a 5 dentro da fileira
	-- as fileiras novas vão para a FRENTE do palco (em direção à câmera, -Z)
	-- e as colunas são centralizadas para a fileira ficar simétrica
	local offsetColuna = coluna - (POR_FILEIRA + 1) / 2
	return BASE + Vector3.new(offsetColuna * ESPACO, 0, -(fileira - 1) * ESPACO)
end

-- ponte servidor -> client (o emote do Jamal SÓ toca no client)
local remote = ReplicatedStorage:FindFirstChild("TocarPassinho")
if not remote then
	remote = Instance.new("RemoteEvent")
	remote.Name = "TocarPassinho"
	remote.Parent = ReplicatedStorage
end

local CORES = {
	Color3.fromRGB(255, 80, 80), Color3.fromRGB(80, 130, 255), Color3.fromRGB(255, 210, 60),
	Color3.fromRGB(80, 230, 120), Color3.fromRGB(230, 80, 255), Color3.fromRGB(255, 140, 60),
}

local function anunciar(texto, cor)
	for _, p in ipairs(Players:GetPlayers()) do
		local pg = p:FindFirstChildOfClass("PlayerGui")
		if not pg then continue end
		local gui = Instance.new("ScreenGui")
		gui.ResetOnSpawn = false
		gui.Parent = pg
		local tl = Instance.new("TextLabel")
		tl.Size = UDim2.fromScale(0.8, 0.12)
		tl.Position = UDim2.fromScale(0.1, 0.06)
		tl.BackgroundColor3 = Color3.fromRGB(15, 15, 15)
		tl.BackgroundTransparency = 0.2
		tl.TextColor3 = cor or Color3.new(1, 1, 1)
		tl.TextScaled = true
		tl.Font = Enum.Font.GothamBlack
		tl.Text = texto
		tl.Parent = gui
		local c = Instance.new("UICorner")
		c.CornerRadius = UDim.new(0, 12)
		c.Parent = tl
		task.delay(4, function() gui:Destroy() end)
	end
end

local function formatarAura(n)
	-- aura de 0 a 10 com uma casa decimal (ex: 7,3)
	return (string.format("%.1f", n):gsub("%.", ","))
end

-- ===================== PONTE TIKBLOX (HTTP) =====================

local function sendRequest(path, method, body)
	local options = {
		Url = BRIDGE_URL .. path,
		Method = method,
		Headers = {
			["x-bridge-token"] = BRIDGE_TOKEN,
			["Content-Type"] = "application/json",
		},
	}
	if body then
		options.Body = HttpService:JSONEncode(body)
	end
	return HttpService:RequestAsync(options)
end

local function avisarCompleto(id)
	if not id then return end
	pcall(function()
		sendRequest("/complete", "POST", { id = id })
	end)
end

-- ===================== CARREGAR O AVATAR REAL =====================

local function criarDancarino(nome, userId, slot)
	if not userId then
		local ok, id = pcall(function()
			return Players:GetUserIdFromNameAsync(nome)
		end)
		if ok and id and id > 0 then
			userId = id
		end
	end
	if not userId then
		return nil, "nick não encontrado"
	end

	local okModel, model = pcall(function()
		return Players:CreateHumanoidModelFromUserId(userId)
	end)
	if not okModel or not model then
		return nil, "erro ao carregar avatar"
	end

	model.Name = "Dancarino_" .. nome
	model:SetAttribute("Nick", nome)
	model:SetAttribute("Aura", 0)
	model:SetAttribute("Slot", slot)
	model.Parent = arena or workspace

	-- REGISTRA O EMOTE DO JAMAL na descrição do avatar
	local humanoid = model:FindFirstChildOfClass("Humanoid")
	if humanoid then
		local okDesc, desc = pcall(function() return humanoid:GetAppliedDescription() end)
		if okDesc and desc then
			desc:AddEmote("Jamal", 137057022541237)
			pcall(function() humanoid:ApplyDescription(desc) end)
		end
	end

	-- posiciona no seu lugar na grade do palco (fileiras de 5 na frente uma da outra)
	model:PivotTo(CFrame.new(posicaoDoSlot(slot)))
	local root = model:FindFirstChild("HumanoidRootPart")
	if root then root.Anchored = true end

	-- etiqueta com o @ e o contador de aura em cima da cabeça
	local cabeca = model:FindFirstChild("Head")
	if cabeca then
		local bb = Instance.new("BillboardGui")
		bb.Name = "Etiqueta"
		bb.Size = UDim2.new(0, 250, 0, 80)
		bb.StudsOffset = Vector3.new(0, 2.6, 0)
		bb.AlwaysOnTop = true
		bb.Parent = cabeca

		local tlNick = Instance.new("TextLabel")
		tlNick.Name = "TextoNick"
		tlNick.Size = UDim2.fromScale(1, 0.5)
		tlNick.Position = UDim2.fromScale(0, 0)
		tlNick.BackgroundTransparency = 1
		tlNick.Text = "@" .. nome
		tlNick.TextColor3 = CORES[((slot - 1) % #CORES) + 1]
		tlNick.TextStrokeTransparency = 0
		tlNick.TextScaled = true
		tlNick.Font = Enum.Font.GothamBold
		tlNick.Parent = bb

		local tlAura = Instance.new("TextLabel")
		tlAura.Name = "TextoAura"
		tlAura.Size = UDim2.fromScale(1, 0.5)
		tlAura.Position = UDim2.fromScale(0, 0.5)
		tlAura.BackgroundTransparency = 1
		tlAura.Text = "⚡ 0 AURA"
		tlAura.TextColor3 = Color3.new(1, 1, 1)
		tlAura.TextStrokeTransparency = 0
		tlAura.TextScaled = true
		tlAura.Font = Enum.Font.GothamBold
		tlAura.Parent = bb
	end

	return model
end

-- passinho na unha: plano B caso o emote falhe no client
local function passinhoNaUnha(model)
	local root = model:FindFirstChild("HumanoidRootPart") or model.PrimaryPart
	if not root then return end
	local centro = root.CFrame
	local rel = {}
	for _, p in ipairs(model:GetDescendants()) do
		if p:IsA("BasePart") then
			p.Anchored = true
			rel[p] = centro:ToObjectSpace(p.CFrame)
		end
	end
	while model.Parent do
		local t = os.clock()
		local pulo = math.abs(math.sin(t * 7)) * 1.2
		local base = centro * CFrame.new(0, pulo, 0) * CFrame.Angles(0, t * 1.6, 0)
		for p, relC in pairs(rel) do
			local extra = CFrame.new()
			local n = p.Name
			if n == "Left Arm" or n == "LeftUpperArm" then
				extra = CFrame.Angles(math.sin(t * 7) * 1.2, 0, 0)
			elseif n == "Right Arm" or n == "RightUpperArm" then
				extra = CFrame.Angles(-math.sin(t * 7) * 1.2, 0, 0)
			elseif n == "Left Leg" or n == "LeftLowerLeg" then
				extra = CFrame.Angles(math.max(0, math.sin(t * 7)) * 0.9, 0, 0)
			elseif n == "Right Leg" or n == "RightLowerLeg" then
				extra = CFrame.Angles(math.max(0, -math.sin(t * 7)) * 0.9, 0, 0)
			elseif n == "Head" then
				extra = CFrame.Angles(0, math.sin(t * 3.5) * 0.4, 0)
			end
			p.CFrame = base * relC * extra
		end
		task.wait()
	end
end

local function sumir(model)
	for alpha = 0, 1, 0.1 do
		if not model.Parent then break end
		for _, p in ipairs(model:GetDescendants()) do
			if p:IsA("BasePart") then p.Transparency = alpha end
		end
		task.wait(0.03)
	end
	model:Destroy()
end

-- reposiciona todo mundo na grade (quando alguém sai, os outros fecham o espaço)
local function posicionarTodos()
	for i, d in ipairs(dancarinos) do
		local m = d.model
		if m and m.Parent then
			m:SetAttribute("Slot", i)
			m:PivotTo(CFrame.new(posicaoDoSlot(i)))
		end
	end
end

local function removerDancarino(d)
	for i, dd in ipairs(dancarinos) do
		if dd == d then
			table.remove(dancarinos, i)
			break
		end
	end
	if d.model then task.spawn(sumir, d.model) end
	avisarCompleto(d.requestId)
	posicionarTodos()
end

local function removerMaisAntigo()
	if #dancarinos > 0 then
		removerDancarino(dancarinos[1])
	end
end

-- client confirma que o emote está rodando no avatar
remote.OnServerEvent:Connect(function(_, model, ok)
	if ok and model and model.Parent then
		model:SetAttribute("EmoteOK", true)
	end
end)

-- ===================== COLOCAR ALGUÉM NO PALCO =====================

local function colocarNoPalco(nome, userId, requestId)
	if #dancarinos >= MAX_DANCARINOS then
		removerMaisAntigo()
	end
	local slot = #dancarinos + 1
	anunciar("NO PALCO: " .. string.upper(nome) .. "!", Color3.fromRGB(255, 210, 60))
	local model, erro = criarDancarino(nome, userId, slot)
	if model then
		table.insert(dancarinos, { model = model, requestId = requestId })
		remote:FireAllClients(model)
		-- plano B se nenhum client conseguir tocar o emote
		task.delay(4, function()
			if model.Parent and not model:GetAttribute("EmoteOK") then
				passinhoNaUnha(model)
			end
		end)
		return true
	end
	anunciar("NÃO ACHEI O NICK " .. string.upper(nome) .. " :(", Color3.fromRGB(255, 80, 80))
	avisarCompleto(requestId)
	return false
end

-- ===================== GERENCIADOR DA FILA =====================

task.spawn(function()
	while true do
		if #fila > 0 then
			local pedido = table.remove(fila, 1)
			colocarNoPalco(pedido.nome, pedido.userId, pedido.requestId)
			task.wait(1)
		else
			task.wait(0.5)
		end
	end
end)

-- ===================== REVELAÇÃO DE AURA (uma por vez) =====================
-- o dançarino com o atributo "Revelando" é o foco da câmera (client)
-- o contador rola números aleatórios por 4 segundos e no 5º segundo
-- trava a aura FINAL (0 a 10, podendo ser decimal) na etiqueta dele
-- depois passa para o próximo dançarino e repete

local function etiquetaAura(m)
	local cabeca = m:FindFirstChild("Head")
	local bb = cabeca and cabeca:FindFirstChild("Etiqueta")
	return bb and bb:FindFirstChild("TextoAura")
end

task.spawn(function()
	while true do
		local atual = nil
		for _, d in ipairs(dancarinos) do
			local m = d.model
			if m and m.Parent and not m:GetAttribute("AuraFinal") then
				atual = m
				break
			end
		end

		if atual then
			atual:SetAttribute("Revelando", true)
			local tl = etiquetaAura(atual)
			local t0 = os.clock()
			-- 4 segundos rolando números aleatórios na etiqueta
			while os.clock() - t0 < 4 and atual.Parent do
				if tl and tl.Parent then
					tl.Text = "⚡ " .. formatarAura(math.random() * AURA_MAX) .. " AURA"
				end
				task.wait(0.12)
			end
			task.wait(1) -- no 5º segundo sai a aura final
			local auraFinal = math.random() * AURA_MAX
			atual:SetAttribute("Aura", auraFinal)
			atual:SetAttribute("AuraFinal", auraFinal)
			if tl and tl.Parent then
				tl.Text = "⚡ " .. formatarAura(auraFinal) .. " AURA"
			end
			atual:SetAttribute("Revelando", false)
			task.wait(1) -- pausa antes de ir para o próximo
		else
			task.wait(0.5)
		end
	end
end)

-- ===================== LEITURA DA PONTE TIKBLOX =====================
-- pergunta ao SEU servidor quem é o próximo da fila (GET /next)

task.spawn(function()
	while true do
		if BRIDGE_URL ~= "https://YOUR_PUBLIC_SERVER/api/roblox" then
			local ok, resposta = pcall(function()
				return sendRequest("/next", "GET")
			end)
			if ok and resposta.Success then
				local okJson, payload = pcall(function() return HttpService:JSONDecode(resposta.Body) end)
				if okJson and type(payload) == "table" and payload.item then
					local item = payload.item
					local nome = tostring(item.name or "?")
					local userId = tonumber(item.userId) or tonumber(item.user_id) or tonumber(item.userid)
					local requestId = item.id
					-- coloca direto no palco (a fila da ponte já é a ordem de chegada)
					local okPalco = colocarNoPalco(nome, userId, requestId)
					if not okPalco then task.wait(1) end
				end
			elseif ok and resposta and resposta.Success == false then
				warn("TikBlox: não foi possível buscar a fila (HTTP " .. tostring(resposta.StatusCode) .. ")")
			end
		end
		task.wait(POLL_INTERVAL_SECONDS)
	end
end)

-- ===================== COMANDOS DE CHAT (teste) =====================

local function limparPalco()
	for _, d in ipairs(dancarinos) do
		if d.model then task.spawn(sumir, d.model) end
		avisarCompleto(d.requestId)
	end
	dancarinos = {}
	anunciar("PALCO LIMPO!")
end

local function processarMensagem(msg)
	msg = string.lower(msg)
	msg = msg:gsub("ç", "c"):gsub("ã", "a"):gsub("á", "a"):gsub("â", "a"):gsub("à", "a")
	msg = msg:gsub("é", "e"):gsub("ê", "e"):gsub("í", "i"):gsub("ó", "o"):gsub("ô", "o"):gsub("õ", "o"):gsub("ú", "u")
	if msg:sub(1, 8) == "!dancar " then
		local nome = msg:sub(9)
		if nome ~= "" then
			nome = nome:gsub("^@", "")
			table.insert(fila, { nome = nome, userId = nil, requestId = nil })
			anunciar(string.upper(nome) .. " ENTROU NA FILA DE DANÇA!")
		end
	elseif msg == "!fila" then
		anunciar(#fila .. " pessoa(s) na fila de dança!")
	elseif msg == "!limpar" then
		limparPalco()
	end
end

local function conectar(player)
	player.Chatted:Connect(function(msg) processarMensagem(msg) end)
end
Players.PlayerAdded:Connect(conectar)
for _, p in ipairs(Players:GetPlayers()) do conectar(p) end