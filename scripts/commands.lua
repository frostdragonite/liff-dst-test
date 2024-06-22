-- Creating all the commands function here.

function api_godmode(player_name)
    local player = UserToPlayer(player_name)
    if player.components.health then
        player.components.health:SetInvincible(not player.components.health.invincible)
    end
end
function api_creative(player_name)
    local player = UserToPlayer(player_name)
    if player.components.builder then
        player.components.builder:GiveAllRecipes()
    end
end
function api_refresh(player_name)
    local player = UserToPlayer(player_name)
    local old_debug = GetDebugEntity()
    SetDebugEntity(player)
    c_sethealth(1)
    c_setsanity(1)
    c_sethunger(1)
    c_settemperature(25)
    c_setmoisture(0)
    c_setbeaverness(1)
    SetDebugEntity(old_debug) 
end


function api_giveitem(player_name, item_prefab, item_amount)
    local player = UserToPlayer(player_name)
    local old_debug = GetDebugEntity()
    SetDebugEntity(player)
    c_give(item_prefab, item_amount)
    SetDebugEntity(old_debug) 
end
function api_dropitem(player_name)
    local player = UserToPlayer(player_name)
    if player.components.inventory then
        player.components.inventory:DropEverything()
    end
end
function api_killrevive(player_name)
    local player = UserToPlayer(player_name)
    if player:HasTag('playerghost') then
        player:PushEvent('respawnfromghost')
        player:DoTaskInTime(2, function()
            if player.components.health then
                player.components.health:SetPercent(1)
            end
            if player.components.sanity then
                player.components.sanity:SetPercent(1)
            end 
            if player.components.hunger then
                player.components.hunger:SetPercent(1)
            end
        end)
    elseif player.components.revivablecorpse and player:HasTag('corpse') then
        player.components.revivablecorpse:Revive(ThePlayer)
        player:DoTaskInTime(2, function()
            if player.components.health then
                player.components.health:SetPercent(1)
            end
        end)
    elseif player.components.health then
        player.components.health:SetPercent(0)
    end
end
function api_reroll(player_name)
    local player = UserToPlayer(player_name)
    if player.components.inventory then
        player.components.inventory:DropEverything()
    end
    if not TheWorld:HasTag('cave') then
        player:PushEvent('ms_playerreroll')
        TheWorld.admin_save = TheWorld.admin_save or {}
        TheWorld.admin_save[player.userid] = player.SaveForReroll and player:SaveForReroll()
        if TheWorld.admin_listen == nil then
            TheWorld.admin_listen = TheWorld:ListenForEvent('ms_newplayerspawned', function(world, p)
                if world.admin_save[p.userid] and p.LoadForReroll then
                    p:LoadForReroll(world.admin_save[p.userid])
                    world.admin_save[p.userid] = nil
                end
            end)
        end
    end
    TheWorld:PushEvent('ms_playerdespawnanddelete', player)
end
function api_despawn(player_name)
    local player = UserToPlayer(player_name)
    if player.components.inventory then
        player.components.inventory:DropEverything()
    end
    TheWorld:PushEvent('ms_playerdespawnanddelete', player)
end


function api_extinguish(player_name)
    local player = UserToPlayer(player_name)
    local x,y,z = player.Transform:GetWorldPosition()
    -- TheSim:FindEntities(x, y, z, radius, musttags, canttags, mustoneoftags)
    for key,ent in ipairs(TheSim:FindEntities(x,y,z, 40, nil, {'FX','DECOR','INLIMBO','burnt'}, {'fire','smolder'})) do
        if ent.components.burnable then
            ent.components.burnable:Extinguish()
        end
    end
end
function api_repair(player_name)
    local player = UserToPlayer(player_name)
    local x,y,z = player.Transform:GetWorldPosition()
    -- TheSim:FindEntities(x, y, z, radius, musttags, canttags, mustoneoftags)
    for key,ent in ipairs(TheSim:FindEntities(x,y,z, 24, {'burnt','structure'}, {'INLIMBO'})) do
        local orig_pos = ent:GetPosition()
        ent:Remove()
        local inst = SpawnPrefab(tostring(ent.prefab), tostring(ent.skinname), nil, player.userid)
        if inst then
            inst.Transform:SetPosition(orig_pos:Get())
        end
    end
end

print("commands.lua loaded!")