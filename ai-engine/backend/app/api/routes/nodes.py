"""Rutas para nodos disponibles y sus configuraciones."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional

router = APIRouter()


class NodeDefinition(BaseModel):
    """Definición de un tipo de nodo disponible."""

    type: str
    name: str
    description: str
    category: str  # 'input', 'generator', 'transform', 'approval', 'output'
    config_schema: Dict[str, Any]  # JSON Schema para config
    input_ports: List[Dict[str, str]]  # [{name, type}]
    output_ports: List[Dict[str, str]]  # [{name, type}]


# Definiciones de nodos disponibles
NODE_DEFINITIONS = [
    {
        "type": "nano_banana_pro",
        "name": "Nano Banana Pro",
        "description": "Genera/edita imágenes con Nano Banana Pro via Kie.ai",
        "category": "generator",
        "config_schema": {
            "type": "object",
            "properties": {
                "model": {
                    "type": "string",
                    "enum": ["nano-banana-pro", "nano-banana-2"],
                    "default": "nano-banana-pro",
                    "description": "Modelo a usar"
                },
                "prompt": {"type": "string", "description": "Prompt para generar/editar la imagen"},
                "negative_prompt": {"type": "string", "description": "Lo que quieres evitar"},
                "aspect_ratio": {
                    "type": "string",
                    "enum": ["16:9", "9:16", "4:3", "3:4"],
                    "default": "16:9",
                },
                "image_quality": {
                    "type": "string",
                    "enum": ["1K", "2K", "4K"],
                    "default": "1K",
                },
                "mode": {
                    "type": "string",
                    "enum": ["generate", "edit"],
                    "default": "generate",
                    "description": "generate=text-to-image, edit=image-to-image"
                },
            },
            "required": ["prompt"],
        },
        "input_ports": [
            {"name": "prompt", "type": "text"},
            {"name": "image_1", "type": "image_url"},
            {"name": "image_2", "type": "image_url"},
            {"name": "image_3", "type": "image_url"},
            {"name": "image_4", "type": "image_url"},
            {"name": "image_5", "type": "image_url"},
            {"name": "image_6", "type": "image_url"},
            {"name": "image_7", "type": "image_url"},
            {"name": "image_8", "type": "image_url"},
            {"name": "image_9", "type": "image_url"},
            {"name": "image_10", "type": "image_url"},
            {"name": "image_11", "type": "image_url"},
            {"name": "image_12", "type": "image_url"},
            {"name": "image_13", "type": "image_url"},
            {"name": "image_14", "type": "image_url"},
        ],
        "output_ports": [{"name": "image", "type": "image_url"}],
    },
    {
        "type": "gemini_image",
        "name": "Gemini Image (Legacy)",
        "description": "Genera imágenes usando Gemini API (compatibilidad legacy)",
        "category": "generator",
        "config_schema": {
            "type": "object",
            "properties": {
                "prompt": {"type": "string", "description": "Prompt para generar la imagen"},
                "negative_prompt": {"type": "string", "description": "Lo que quieres evitar"},
                "aspect_ratio": {
                    "type": "string",
                    "enum": ["1:1", "16:9", "9:16", "4:3", "3:4"],
                    "default": "1:1",
                },
                "num_images": {"type": "integer", "minimum": 1, "maximum": 4, "default": 1},
            },
            "required": ["prompt"],
        },
        "input_ports": [{"name": "input", "type": "text"}],
        "output_ports": [{"name": "image", "type": "image_url"}],
    },
    {
        "type": "kling_video",
        "name": "Kling Video",
        "description": "Genera video usando Kling/Sora2 via Kie.ai",
        "category": "generator",
        "config_schema": {
            "type": "object",
            "properties": {
                "model": {
                    "type": "string",
                    "enum": ["kling", "sora2", "wan"],
                    "default": "kling",
                    "description": "Modelo de generación de video"
                },
                "prompt": {"type": "string", "description": "Prompt para generar el video"},
                "duration": {"type": "integer", "minimum": 1, "maximum": 10, "default": 5},
                "aspect_ratio": {
                    "type": "string",
                    "enum": ["16:9", "9:16"],
                    "default": "16:9",
                },
            },
            "required": ["prompt"],
        },
        "input_ports": [
            {"name": "prompt", "type": "text"},
            {"name": "image", "type": "image_url", "optional": True},
        ],
        "output_ports": [{"name": "video", "type": "video_url"}],
    },
    {
        "type": "approval",
        "name": "Human Approval",
        "description": "Punto de aprobación humana en el pipeline",
        "category": "approval",
        "config_schema": {
            "type": "object",
            "properties": {
                "instruction": {"type": "string", "description": "Instrucciones para el aprobador"},
                "required_role": {
                    "type": "string",
                    "enum": ["any", "admin", "creator"],
                    "default": "any",
                },
                "timeout_hours": {"type": "integer", "minimum": 1, "default": 24},
            },
        },
        "input_ports": [{"name": "input", "type": "any"}],
        "output_ports": [
            {"name": "approved", "type": "any"},
            {"name": "rejected", "type": "any"},
        ],
    },
    {
        "type": "text_transform",
        "name": "Text Transform",
        "description": "Transforma texto usando plantillas o LLM",
        "category": "transform",
        "config_schema": {
            "type": "object",
            "properties": {
                "template": {"type": "string", "description": "Plantilla con placeholders {variable}"},
                "llm_prompt": {"type": "string", "description": "Prompt para LLM si es transformación AI"},
                "model": {"type": "string", "default": "gemini-pro"},
            },
        },
        "input_ports": [{"name": "input", "type": "text"}],
        "output_ports": [{"name": "output", "type": "text"}],
    },
    {
        "type": "image_merge",
        "name": "Image Merge",
        "description": "Combina múltiples imágenes en una composición",
        "category": "transform",
        "config_schema": {
            "type": "object",
            "properties": {
                "layout": {
                    "type": "string",
                    "enum": ["grid", "horizontal", "vertical", "collage"],
                    "default": "grid",
                },
                "background_color": {"type": "string", "default": "#000000"},
                "spacing": {"type": "integer", "default": 10},
            },
        },
        "input_ports": [{"name": "images", "type": "image_list"}],
        "output_ports": [{"name": "merged", "type": "image_url"}],
    },
    {
        "type": "output",
        "name": "Output/Delivery",
        "description": "Punto final de entrega de resultados",
        "category": "output",
        "config_schema": {
            "type": "object",
            "properties": {
                "delivery_method": {
                    "type": "string",
                    "enum": ["download", "email", "webhook", "s3"],
                    "default": "download",
                },
                "webhook_url": {"type": "string", "description": "URL para webhook (si aplica)"},
                "email_recipients": {"type": "array", "items": {"type": "string"}},
            },
        },
        "input_ports": [{"name": "input", "type": "any"}],
        "output_ports": [],
    },
]


@router.get("", response_model=List[NodeDefinition])
async def list_node_types():
    """Lista todos los tipos de nodos disponibles."""
    return NODE_DEFINITIONS


@router.get("/{node_type}", response_model=NodeDefinition)
async def get_node_definition(node_type: str):
    """Obtiene la definición completa de un tipo de nodo."""
    for node_def in NODE_DEFINITIONS:
        if node_def["type"] == node_type:
            return node_def

    raise HTTPException(status_code=404, detail=f"Tipo de nodo no encontrado: {node_type}")


@router.get("/categories/{category}", response_model=List[NodeDefinition])
async def get_nodes_by_category(category: str):
    """Lista nodos por categoría."""
    return [n for n in NODE_DEFINITIONS if n["category"] == category]
