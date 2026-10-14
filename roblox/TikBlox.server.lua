local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local Workspace = game:GetService("Workspace")

local BRIDGE_URL = "https://YOUR_RENDER_SERVICE.onrender.com/api/roblox"
local BRIDGE_TOKEN = "YOUR_ROBLOX_BRIDGE_TOKEN"
local DANCE_ANIMATION_ID = "rbxassetid://507771019"
local NPC_LIFETIME_SECONDS = 30
local POLL_INTERVAL_SECONDS = 3
local SPAWN_CFRAME = CFrame.new(0, 5, 0)

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

local function playDance(request)
	local model = Players:CreateHumanoidModelFromUserIdAsync(request.userId)
	model.Name = request.name .. "_DanceNPC"
	model:PivotTo(SPAWN_CFRAME)
	model.Parent = Workspace

	local humanoid = model:FindFirstChildOfClass("Humanoid")
	if not humanoid then
		model:Destroy()
		return false
	end

	local animator = humanoid:FindFirstChildOfClass("Animator") or Instance.new("Animator", humanoid)
	local animation = Instance.new("Animation")
	animation.AnimationId = DANCE_ANIMATION_ID
	local track = animator:LoadAnimation(animation)
	track.Looped = true
	track:Play()
	task.delay(NPC_LIFETIME_SECONDS, function()
		if model.Parent then
			track:Stop()
			model:Destroy()
		end
		pcall(function()
			sendRequest("/complete", "POST", { id = request.id })
		end)
	end)
	return true
end

local function processNextRequest()
	local response = sendRequest("/next", "GET")
	if not response.Success then
		warn("TikBlox: não foi possível buscar a fila (HTTP " .. response.StatusCode .. ")")
		return
	end

	local payload = HttpService:JSONDecode(response.Body)
	local request = payload.item
	if not request then
		return
	end

	local ok, err = pcall(playDance, request)
	if not ok then
		warn("TikBlox: falha ao criar NPC: " .. tostring(err))
		pcall(function()
			sendRequest("/complete", "POST", { id = request.id })
		end)
	elseif not err then
		pcall(function()
			sendRequest("/complete", "POST", { id = request.id })
		end)
	end
end

while true do
	local ok, err = pcall(processNextRequest)
	if not ok then
		warn("TikBlox: erro na ponte: " .. tostring(err))
	end
	task.wait(POLL_INTERVAL_SECONDS)
end
