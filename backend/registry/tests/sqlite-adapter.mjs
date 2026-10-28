import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
export function localDatabase(){
 const db=new DatabaseSync(':memory:');
 for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())db.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
 function prepared(sql,args=[]){return {sql,args,bind(...values){return prepared(sql,values);},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){const r=db.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)},results:[]};}};}
 return {prepare:sql=>prepared(sql),async batch(statements){db.exec('BEGIN IMMEDIATE');try{const results=statements.map(s=>/^\s*SELECT/i.test(s.sql)?{results:db.prepare(s.sql).all(...s.args),meta:{changes:0}}:{results:[],meta:{changes:Number(db.prepare(s.sql).run(...s.args).changes)}});db.exec('COMMIT');return results;}catch(error){db.exec('ROLLBACK');throw error;}},close:()=>db.close()};
}
