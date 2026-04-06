"""Wrapper para LumaLabs API - Generación de video."""

import asyncio
import time
from typing import Optional, Dict, Any, List
import httpx
from ..core.config import settings


class LumaAPIError(Exception):
    """Error en la API de LumaLabs."""

    pass


class LumaWrapper:
    """Cliente para la API de LumaLabs."""

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or settings.LUMA_API_KEY
        if not self.api_key:
            raise ValueError("LUMA_API_KEY no configurada")

        self.base_url = "https://api.lumalabs.ai/dream-machine/v1"
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    async def generate_video(
        self,
        prompt: str,
        image_url: Optional[str] = None,
        duration: int = 5,
        aspect_ratio: str = "16:9",
    ) -> Dict[str, Any]:
        """
        Genera un video usando LumaLabs.

        Args:
            prompt: Descripción del video a generar
            image_url: URL de imagen de referencia (opcional para image-to-video)
            duration: Duración en segundos (1-10)
            aspect_ratio: Relación de aspecto (16:9, 9:16, 1:1)

        Returns:
            Dict con:
            - video_url: URL del video generado
            - generation_id: ID de la generación
            - prompt: Prompt usado
            - generation_time: Tiempo total de generación
        """
        try:
            async with httpx.AsyncClient() as client:
                # Preparar payload
                payload = {
                    "prompt": prompt,
                    "aspect_ratio": aspect_ratio,
                }

                if image_url:
                    payload["image"] = image_url

                # Iniciar generación
                response = await client.post(
                    f"{self.base_url}/generations",
                    headers=self.headers,
                    json=payload,
                    timeout=30.0,
                )

                if response.status_code != 200:
                    raise LumaAPIError(
                        f"Error iniciando generación: {response.status_code} - {response.text}"
                    )

                generation_data = response.json()
                generation_id = generation_data.get("id")

                if not generation_id:
                    raise LumaAPIError("No se recibió ID de generación")

                # Polling hasta completar
                start_time = time.time()
                max_wait_time = 300  # 5 minutos máximo

                while True:
                    await asyncio.sleep(5)  # Esperar 5 segundos entre polls

                    status_response = await client.get(
                        f"{self.base_url}/generations/{generation_id}",
                        headers=self.headers,
                        timeout=30.0,
                    )

                    if status_response.status_code != 200:
                        raise LumaAPIError(
                            f"Error consultando estado: {status_response.status_code}"
                        )

                    status_data = status_response.json()
                    state = status_data.get("state", "processing")

                    if state == "completed":
                        video_url = status_data.get("assets", {}).get("video")
                        if not video_url:
                            raise LumaAPIError("Video URL no encontrada en respuesta")

                        return {
                            "video_url": video_url,
                            "generation_id": generation_id,
                            "prompt": prompt,
                            "image_url": image_url,
                            "duration": duration,
                            "aspect_ratio": aspect_ratio,
                            "generation_time": time.time() - start_time,
                        }

                    elif state == "failed":
                        error_msg = status_data.get("failure_reason", "Error desconocido")
                        raise LumaAPIError(f"Generación falló: {error_msg}")

                    # Si aún está processing, continuar polling
                    if time.time() - start_time > max_wait_time:
                        raise LumaAPIError(
                            f"Timeout: La generación excedió {max_wait_time} segundos"
                        )

        except httpx.TimeoutException as e:
            raise LumaAPIError(f"Timeout en petición HTTP: {str(e)}")
        except Exception as e:
            raise LumaAPIError(f"Error generando video: {str(e)}")

    async def get_generation_status(
        self, generation_id: str
    ) -> Dict[str, Any]:
        """
        Consulta el estado de una generación.

        Args:
            generation_id: ID de la generación a consultar

        Returns:
            Dict con estado y datos de la generación
        """
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.base_url}/generations/{generation_id}",
                    headers=self.headers,
                    timeout=30.0,
                )

                if response.status_code != 200:
                    raise LumaAPIError(
                        f"Error consultando estado: {response.status_code}"
                    )

                return response.json()

        except Exception as e:
            raise LumaAPIError(f"Error consultando estado: {str(e)}")

    async def generate_video_from_images(
        self,
        image_urls: List[str],
        prompt: str,
        transition_style: str = "smooth",
    ) -> Dict[str, Any]:
        """
        Genera un video a partir de múltiples imágenes.

        Args:
            image_urls: Lista de URLs de imágenes
            prompt: Descripción del video
            transition_style: Estilo de transición (smooth, fade, slide)

        Returns:
            Dict con el video generado
        """
        # Implementación específica para multi-image video
        # Luma puede tener un endpoint diferente para esto
        full_prompt = f"{prompt}. Transiciones {transition_style} entre imágenes."

        # Usar la primera imagen como referencia principal
        primary_image = image_urls[0] if image_urls else None

        return await self.generate_video(
            prompt=full_prompt,
            image_url=primary_image,
        )
