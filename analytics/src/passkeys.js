import {generateRegistrationOptions,verifyRegistrationResponse,generateAuthenticationOptions,verifyAuthenticationResponse} from '@simplewebauthn/server';
const bytesToString=bytes=>btoa(String.fromCharCode(...bytes));
const stringToBytes=text=>Uint8Array.from(atob(text),c=>c.charCodeAt(0));
export async function passkeyRequest(request,env,authenticated) {
 const url=new URL(request.url),register=url.pathname.includes('/register/');
 if(request.method!=='POST'||request.headers.get('Origin')!==url.origin)return Response.json({error:'origin'},{status:403});
 if(register&&!authenticated)return Response.json({error:'unauthorized'},{status:401});
 const body=await request.json();const rpID=url.hostname;
 await env.DB.prepare('DELETE FROM auth_challenges WHERE expires<?').bind(Date.now()).run();
 if(url.pathname.endsWith('/options')){
  const {results}=await env.DB.prepare('SELECT id,transports FROM passkeys').all();
  if(register&&results.length>=10)return Response.json({error:'最多注册 10 个通行密钥'},{status:400});
  const credentials=results.map(p=>({id:p.id,transports:JSON.parse(p.transports)}));
  const options=register?await generateRegistrationOptions({rpName:'Sharing Notes 统计',rpID,userName:'Sharing Notes 管理员',userID:new TextEncoder().encode('sharingnotes-admin'),attestationType:'none',excludeCredentials:credentials,authenticatorSelection:{residentKey:'required',userVerification:'required'},supportedAlgorithmIDs:[-7,-257]}):await generateAuthenticationOptions({rpID,allowCredentials:credentials,userVerification:'required'});
  const id=crypto.randomUUID();await env.DB.prepare('INSERT INTO auth_challenges VALUES(?,?,?,?)').bind(id,options.challenge,register?'register':'login',Date.now()+300000).run();
  return Response.json({id,options});
 }
 if(!body.id||!body.response)return Response.json({error:'invalid'},{status:400});
 const challenge=await env.DB.prepare('DELETE FROM auth_challenges WHERE id=? AND kind=? AND expires>? RETURNING challenge').bind(body.id,register?'register':'login',Date.now()).first();
 if(!challenge)return Response.json({error:'验证已过期，请重试'},{status:400});
 if(register){
  const verification=await verifyRegistrationResponse({response:body.response,expectedChallenge:challenge.challenge,expectedOrigin:url.origin,expectedRPID:rpID,requireUserVerification:true,supportedAlgorithmIDs:[-7,-257]});
  if(!verification.verified)return Response.json({error:'验证失败'},{status:400});
  const c=verification.registrationInfo.credential;
  await env.DB.prepare('INSERT INTO passkeys VALUES(?,?,?,?,?)').bind(c.id,bytesToString(c.publicKey),c.counter,JSON.stringify(c.transports||[]),Date.now()).run();
  return Response.json({registered:true});
 }
 const credential=await env.DB.prepare('SELECT * FROM passkeys WHERE id=?').bind(body.response.id).first();
 if(!credential)return Response.json({error:'未注册的通行密钥'},{status:400});
 const verification=await verifyAuthenticationResponse({response:body.response,expectedChallenge:challenge.challenge,expectedOrigin:url.origin,expectedRPID:rpID,requireUserVerification:true,credential:{id:credential.id,publicKey:stringToBytes(credential.public_key),counter:credential.counter,transports:JSON.parse(credential.transports)}});
 if(!verification.verified)return Response.json({error:'验证失败'},{status:400});
 await env.DB.prepare('UPDATE passkeys SET counter=? WHERE id=?').bind(verification.authenticationInfo.newCounter,credential.id).run();
 return {authenticated:true};
}
