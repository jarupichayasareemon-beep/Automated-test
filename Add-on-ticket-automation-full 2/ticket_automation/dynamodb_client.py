"""
เขียนค่าลง DynamoDB เพื่อผูก add-on ticket กับ main ticket โดยใช้ boto3 — ยืนยัน flow จริงแล้ว
(ไม่ใช่แค่บันทึก ticket id ลง event เฉยๆ แต่ต้องตั้งค่า 3 จุดตามลำดับนี้):

  1. table events_v1 (key: event_id)                 -> SET is_add_on = true
  2. table ticket_type_v1 (key: ticket_type_id = addon ticket id) -> SET type = "add-on"
  3. table ticket_type_v1 (key: ticket_type_id = main ticket id)  -> SET add_on = {
         "condition": "one_ticket_one_item",
         "is_active": true,
         "ticket_type": {
             "<addon_ticket_id>": {"conditions": {"min": 1, "max": 3}}
         }
     }

Auth: ใช้ AWS credentials ตามปกติของ boto3 — เรียงลำดับการค้นหาคือ
  env vars (AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY) -> ~/.aws/credentials (AWS_PROFILE)
  -> IAM role (ถ้ารันบน EC2/ECS/Lambda)
แนะนำให้รัน `aws configure --profile <ชื่อ profile>` ครั้งเดียวบนเครื่อง แล้วตั้ง
AWS_PROFILE ใน .env ให้ตรงกัน ไม่ต้อง hardcode key ในโค้ด

Permission ขั้นต่ำที่ IAM user/role ต้องมี: dynamodb:UpdateItem บนทั้ง events_v1 และ
ticket_type_v1
"""
from __future__ import annotations

import boto3

from .config import Config


class DynamoDBWriter:
    def __init__(self):
        session = boto3.Session(profile_name=Config.AWS_PROFILE, region_name=Config.AWS_REGION)
        dynamodb = session.resource("dynamodb")
        self._events_table = dynamodb.Table(Config.DYNAMODB_TABLE)
        self._ticket_type_table = dynamodb.Table(Config.DYNAMODB_TICKET_TYPE_TABLE)

    def link_addon_ticket(self, event_id: str, main_ticket_id: str, addon_ticket_id: str) -> dict:
        """ทำครบ 3 ขั้นตอนตาม flow จริง คืนค่า dict สรุปผลลัพธ์ (Attributes ล่าสุด) ของแต่ละขั้น"""
        results: dict = {}

        # 1) event -> is_add_on = true
        results["event"] = self._events_table.update_item(
            Key={Config.DYNAMODB_PARTITION_KEY: event_id},
            UpdateExpression="SET is_add_on = :val",
            ExpressionAttributeValues={":val": True},
            ReturnValues="ALL_NEW",
        ).get("Attributes", {})

        # 2) addon ticket type -> type = "add-on" ("type" เป็นคำสงวนใน DynamoDB expression
        #    เลยต้องใช้ ExpressionAttributeNames แทนการเขียนชื่อ field ตรงๆ)
        results["addon_ticket_type"] = self._ticket_type_table.update_item(
            Key={Config.DYNAMODB_TICKET_TYPE_PARTITION_KEY: addon_ticket_id},
            UpdateExpression="SET #t = :val",
            ExpressionAttributeNames={"#t": "type"},
            ExpressionAttributeValues={":val": "add-on"},
            ReturnValues="ALL_NEW",
        ).get("Attributes", {})

        # 3) main ticket type -> add_on = {...} ผูกไปหา addon ticket type id
        results["main_ticket_type"] = self._ticket_type_table.update_item(
            Key={Config.DYNAMODB_TICKET_TYPE_PARTITION_KEY: main_ticket_id},
            UpdateExpression="SET add_on = :val",
            ExpressionAttributeValues={
                ":val": {
                    "condition": Config.ADDON_CONDITION,
                    "is_active": True,
                    "ticket_type": {
                        addon_ticket_id: {
                            "conditions": {
                                "min": Config.ADDON_MIN_QTY,
                                "max": Config.ADDON_MAX_QTY,
                            }
                        }
                    },
                }
            },
            ReturnValues="ALL_NEW",
        ).get("Attributes", {})

        return results
