from sqlalchemy import text
from backend.db.session import AsyncSessionLocal
import json

async def upsert_user(google_sub, email, name, avatar_url):
    async with AsyncSessionLocal() as db:
        r = await db.execute(text("""insert into users (google_sub,email,name,avatar_url)
        values (:sub,:email,:name,:avatar) on conflict (google_sub) do update
        set email=excluded.email,name=excluded.name,avatar_url=excluded.avatar_url
        returning id,email,name,avatar_url"""), {"sub":google_sub,"email":email,"name":name,"avatar":avatar_url})
        await db.commit()
        return dict(r.mappings().first())

async def create_analysis_job(user_id, title, raw_preview):
    async with AsyncSessionLocal() as db:
        r = await db.execute(text("""insert into analyses (user_id,title,raw_input_preview,status,progress)
        values (:user_id,:title,:preview,'pending',:progress) returning id,created_at"""),
        {"user_id":user_id,"title":title,"preview":raw_preview,"progress":'{"completed":0,"total":0}'})
        await db.commit()
        return dict(r.mappings().first())

async def update_analysis_job(analysis_id, status=None, progress=None, structured_data=None, error_message=None):
    async with AsyncSessionLocal() as db:
        updates = []
        params = {"id": analysis_id}
        if status is not None:
            updates.append("status=:status")
            params["status"] = status
        if progress is not None:
            updates.append("progress=:progress")
            params["progress"] = json.dumps(progress)
        if structured_data is not None:
            updates.append("structured_data=:data")
            params["data"] = json.dumps(structured_data)
        if error_message is not None:
            updates.append("error_message=:error")
            params["error"] = error_message
        
        if updates:
            query = f"update analyses set {','.join(updates)} where id=:id"
            await db.execute(text(query), params)
            await db.commit()

async def list_analyses_for_user(user_id):
    async with AsyncSessionLocal() as db:
        r = await db.execute(text("select id,title,created_at,status,progress,error_message from analyses where user_id=:user_id order by created_at desc"), {"user_id":user_id})
        res = []
        for x in r.mappings().all():
            d = dict(x)
            if isinstance(d.get("progress"), str): d["progress"] = json.loads(d["progress"])
            res.append(d)
        return res

async def get_analysis_for_user(user_id, analysis_id):
    async with AsyncSessionLocal() as db:
        r = await db.execute(text("select * from analyses where id=:id and user_id=:user_id"), {"id":analysis_id,"user_id":user_id})
        row = r.mappings().first()
        if not row: return None
        out = dict(row)
        if isinstance(out.get("structured_data"), str) and out["structured_data"]: out["structured_data"] = json.loads(out["structured_data"])
        if isinstance(out.get("progress"), str) and out["progress"]: out["progress"] = json.loads(out["progress"])
        return out

async def delete_analysis_for_user(user_id, analysis_id):
    async with AsyncSessionLocal() as db:
        r = await db.execute(text("delete from analyses where id=:id and user_id=:user_id"), {"id":analysis_id,"user_id":user_id})
        await db.commit()
        return r.rowcount > 0

async def get_message_hashes(user_id, hashes):
    if not hashes: return {}
    async with AsyncSessionLocal() as db:
        r = await db.execute(text("select message_hash, cached_intelligence from message_hashes where user_id=:uid and message_hash = any(:hashes)"), {"uid": user_id, "hashes": list(hashes)})
        out = {}
        for row in r.mappings().all():
            data = row["cached_intelligence"]
            if isinstance(data, str): data = json.loads(data)
            out[row["message_hash"]] = data
        return out

async def create_message_hashes(user_id, hash_data_map):
    if not hash_data_map: return
    async with AsyncSessionLocal() as db:
        for msg_hash, data in hash_data_map.items():
            await db.execute(text("""insert into message_hashes (user_id, message_hash, cached_intelligence)
            values (:uid, :h, :d) on conflict (user_id, message_hash) do nothing"""),
            {"uid": user_id, "h": msg_hash, "d": json.dumps(data)})
        await db.commit()