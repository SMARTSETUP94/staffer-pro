import { describe,it,expect,vi } from "vitest";
import { AuthContext, auth, defineMcp, defineTool } from "@lovable.dev/mcp-js";
import { createTanStackMcpHandler } from "@lovable.dev/mcp-js/stacks/tanstack";
import { createAppContext, compactResult, readTool, safeAuditArguments } from "../policy";
import { pageRows, readData } from "../read-data";
import { pageSchema } from "../schemas";
import { z } from "zod";
import { oauthReturnPath } from "@/lib/oauth-return-path";
import { TOOL_CAPS } from "../config";

function query(data:unknown[]) { const q:any={};for(const key of ["select","eq","is","neq","gte","lte","gt","or","in","order","limit","range"])q[key]=()=>q;q.then=(resolve:any)=>Promise.resolve({data,error:null}).then(resolve);return q; }
const fixture = { id:"affaire",numero:"6067",nom:"Décor",client:"Client",date:"2026-10-26",date_montage:"2026-10-27",date_demontage:null,metier_id:1,employe_id:"personne",affaire_id:"affaire",demi_journee:"AM",nb_pers:2,capacite_jour:3,heures_reelles:4,heures_prevues:8,statut:"valide",client_id:"client" };
function context(){return {userId:"u",clientId:"c",caps:new Set<string>(Object.values(TOOL_CAPS)),db:{from:vi.fn(()=>query([fixture])),rpc:vi.fn((name:string)=> name==="user_cap_scope"?Promise.resolve({data:"all",error:null}):query([fixture]))} as any};}
describe("MCP v1 security and readers",()=>{
 it("pagination default 25, max 100",()=>{expect(z.object(pageSchema).parse({}).limit).toBe(25);expect(()=>z.object(pageSchema).parse({limit:101})).toThrow();const p=pageRows(Array.from({length:30},(_,id)=>({id})),{limit:25,cursor:"0"});expect(p.rows).toHaveLength(25);expect(p.next_cursor).toBe("25");expect(pageRows(Array.from({length:30},(_,id)=>({id})),{limit:25,cursor:"25"}).rows).toEqual([{id:25},{id:26},{id:27},{id:28},{id:29}]);});
 it("response cap 200000 bytes",()=>{expect(()=>compactResult({x:"a".repeat(200001)})).toThrow();});
 it("no sensitive audit arguments",()=>{expect(safeAuditArguments({q:"private",password:"secret",email:"private",limit:25})).toEqual({limit:25});});
 it("business cap refusal is audited without reading",async()=>{const ctx=context();ctx.caps.clear();const read=vi.fn();ctx.db.from=vi.fn(()=>({insert:vi.fn().mockResolvedValue({error:null})}));const result=await readTool(ctx,"heures_affaire",{},read);expect("isError" in result && result.isError).toBe(true);expect(read).not.toHaveBeenCalled();expect(ctx.db.from).toHaveBeenCalledWith("mcp_audit_log");});
 it("successful result writes audit",async()=>{const ctx=context();const insert=vi.fn().mockResolvedValue({error:null});ctx.db.from=vi.fn(()=>({insert}));const r=await readTool(ctx,"mon_profil",{},async()=>({rows:[{id:1}]}));expect("isError" in r).toBe(false);expect(insert).toHaveBeenCalledWith(expect.objectContaining({user_id:"u",client_id:"c",tool:"mon_profil",nb_lignes:1,statut:"ok"}));});
 it("audit failure fails closed",async()=>{const ctx=context();ctx.db.from=vi.fn(()=>({insert:vi.fn().mockResolvedValue({error:{message:"down"}})}));await expect(readTool(ctx,"mon_profil",{},async()=>({rows:[{}]}))).rejects.toThrow("Journal indisponible");});
 it("api.mcp absent refuses context",async()=>{await expect(createAppContext({auth:new AuthContext(undefined),signal:new AbortController().signal})).rejects.toThrow();});
 it.each(Object.keys(TOOL_CAPS))("reader %s uses seeded safe data",async(name)=>{const ctx=context();ctx.caps.add("opportunites.read.all");const args={limit:25,cursor:"0",numero:"6067",du:"2026-10-26",au:"2026-10-30",fenetre:"14j",...(name==="heures_affaire"?{affaire_id:"affaire"}:{})};const result=await readData(ctx,name as keyof typeof TOOL_CAPS,args);expect(result.rows.length).toBeGreaterThan(0);expect(JSON.stringify(result)).not.toContain("salaire");});
 it("return path rejects external and preserves consent",()=>{expect(oauthReturnPath("/\\evil.com")).toBe("/");expect(oauthReturnPath("//evil.com")).toBe("/");expect(oauthReturnPath("/.lovable/oauth/consent?authorization_id=abc#x")).toBe("/.lovable/oauth/consent?authorization_id=abc#x");});
});
describe("official JSON-RPC transport",()=>{
 const tool=defineTool({name:"seed_read",title:"Lire",description:"Lire données de test",inputSchema:{},annotations:{readOnlyHint:true},handler:()=>({content:[{type:"text",text:'{"rows":[{"id":1}]}'}]})});
 const server=defineMcp({name:"test",title:"Test",version:"1",instructions:"test",tools:[tool]});
 const handler=createTanStackMcpHandler(server);
 const request=(method:string,params?:unknown)=>new Request("http://localhost:8080/mcp",{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json, text/event-stream"},body:JSON.stringify({jsonrpc:"2.0",id:1,method,params})});
 it.each(["2025-06-18","2025-03-26"])("initialize accepts %s",async(protocolVersion)=>{const r=await handler({request:request("initialize",{protocolVersion,capabilities:{},clientInfo:{name:"test",version:"1"}})});expect(r.status).toBe(200);const text=await r.text();expect(text).toContain('"serverInfo"');expect(text).toContain(protocolVersion);});
 it("tools/list advertises readOnly and strict schema",async()=>{const r=await handler({request:request("tools/list")});const text=await r.text();expect(text).toContain('"readOnlyHint":true');expect(text).toContain('"additionalProperties":false');});
 it("401 without bearer includes metadata",async()=>{const secured=defineMcp({name:"test-secure",title:"Test",version:"1",instructions:"test",tools:[tool],auth:auth.oauth.issuer({issuer:"https://auth.example.org",acceptedAudiences:"authenticated"})});const r=await createTanStackMcpHandler(secured)({request:request("ping")});expect(r.status).toBe(401);expect(r.headers.get("WWW-Authenticate")).toContain('resource_metadata="http://localhost:8080/.well-known/oauth-protected-resource"');});
});