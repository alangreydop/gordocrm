"""Wrapper para Kie.ai API - Acceso unificado a múltiples modelos AI."""

import asyncio
import logging
from typing import Any, Dict, List, Optional
from datetime import datetime
import httpx

logger = logging.getLogger(__name__)


class KieAPIError(Exception):
    """Error para operaciones de Kie.ai API."""

    def __init__(self, message: str, code: Optional[int] = None):
        self.message = message
        self.code = code
        super().__init__(self.message)


class KieWrapper:
    """
    Wrapper para Kie.ai API.

    Kie.ai provee acceso unificado a múltiples modelos:
    - Imagen: Z-image, Grok Imagine, Flux-2, Google Imagen, Ideogram, Recraft, Topaz
    - Video: Kling, Sora2, Bytedance, Hailuo, Wan, Grok Imagine Video
    - Audio: ElevenLabs (TTS, STT, audio isolation)
    - Chat: Gemini 2.5 Flash, Gemini 2.5 Pro

    API Docs: https://docs.kie.ai/
    """

    BASE_URL = "https://api.kie.ai"
    POLL_INTERVAL = 3  # segundos entre polls
    MAX_POLL_ATTEMPTS = 100  # ~5 minutos de timeout

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key
        if not api_key:
            raise ValueError("Kie.ai API key requerida")

        self.client = httpx.AsyncClient(
            base_url=self.BASE_URL,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            timeout=60.0,
        )

    async def close(self):
        """Cerrar el cliente HTTP."""
        await self.client.aclose()

    # ========================================================================
    # Métodos principales - Patrón asíncrono
    # ========================================================================

    async def create_task(
        self,
        model: str,
        action: str,
        params: Dict[str, Any],
    ) -> str:
        """
        Crea una tarea de generación.

        Args:
            model: Modelo a usar (ej: "nano-banana-pro", "flux-2", "kling")
            action: Acción (ej: "generate", "edit", "upscale")
            params: Parámetros específicos del modelo

        Returns:
            task_id para hacer polling
        """
        try:
            response = await self.client.post(
                "/api/v1/jobs/createTask",
                json={
                    "model": model,
                    "action": action,
                    "params": params,
                },
            )

            if response.status_code != 200:
                error = response.json().get("msg", "Error creando tarea")
                raise KieAPIError(error, code=response.status_code)

            data = response.json()
            task_id = data.get("task_id")

            if not task_id:
                raise KieAPIError("No se recibió task_id de la respuesta")

            logger.info(f"Tarea creada: {task_id} (modelo: {model}, acción: {action})")
            return task_id

        except httpx.RequestError as e:
            raise KieAPIError(f"Error de conexión: {str(e)}")

    async def check_status(self, task_id: str) -> Dict[str, Any]:
        """
        Verifica el estado de una tarea.

        Args:
            task_id: ID de la tarea

        Returns:
            Dict con status y results si completado
        """
        try:
            response = await self.client.get(
                f"/api/v1/jobs/recordInfo?taskId={task_id}"
            )

            if response.status_code != 200:
                error = response.json().get("msg", "Error consultando estado")
                raise KieAPIError(error, code=response.status_code)

            data = response.json()
            return data

        except httpx.RequestError as e:
            raise KieAPIError(f"Error de conexión: {str(e)}")

    async def wait_for_completion(
        self, task_id: str, poll_interval: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        Espera a que una tarea se complete haciendo polling.

        Args:
            task_id: ID de la tarea
            poll_interval: Intervalo entre polls (default: POLL_INTERVAL)

        Returns:
            Resultado de la tarea
        """
        interval = poll_interval or self.POLL_INTERVAL

        for attempt in range(self.MAX_POLL_ATTEMPTS):
            status_data = await self.check_status(task_id)
            status = status_data.get("status", "").lower()

            logger.debug(
                f"Polling {task_id} - intento {attempt + 1}, estado: {status}"
            )

            if status == "completed":
                logger.info(f"Tarea {task_id} completada exitosamente")
                return status_data
            elif status in ["failed", "error", "cancelled"]:
                error_msg = status_data.get("error", "Tarea falló")
                raise KieAPIError(f"Tarea fallida: {error_msg}")
            elif status in ["processing", "running", "queued", "pending"]:
                await asyncio.sleep(interval)
            else:
                logger.warning(f"Estado desconocido: {status}")
                await asyncio.sleep(interval)

        raise KieAPIError(
            f"Timeout esperando tarea {task_id} después de {self.MAX_POLL_ATTEMPTS} intentos"
        )

    # ========================================================================
    # Métodos específicos por categoría
    # ========================================================================

    # --- IMAGEN ---

    async def generate_image(
        self,
        model: str,
        prompt: str,
        negative_prompt: Optional[str] = None,
        aspect_ratio: str = "16:9",
        image_quality: str = "1K",
        input_images: Optional[List[str]] = None,
        mode: str = "generate",
        **extra_params: Any,
    ) -> Dict[str, Any]:
        """
        Genera o edita imagen usando Kie.ai.

        Args:
            model: Modelo específico (ej: "nano-banana-pro", "flux-2")
            prompt: Prompt de generación
            negative_prompt: Prompt negativo
            aspect_ratio: Relación de aspecto
            image_quality: Calidad (1K, 2K, 4K)
            input_images: URLs de imágenes de entrada (para modo edit)
            mode: "generate" o "edit"
            **extra_params: Parámetros extra específicos del modelo

        Returns:
            Dict con image_url y metadata
        """
        params: Dict[str, Any] = {
            "prompt": prompt,
            "mode": mode,
            "aspectRatio": aspect_ratio,
            "imageQuality": image_quality,
        }

        if negative_prompt:
            params["negativePrompt"] = negative_prompt

        if input_images and mode == "edit":
            # Kie.ai acepta hasta 8 imágenes para nano-banana-pro
            params["inputImageUrls"] = input_images[:8]

        params.update(extra_params)

        task_id = await self.create_task(
            model=model,
            action="generate" if mode == "generate" else "edit",
            params=params,
        )

        result = await self.wait_for_completion(task_id)

        # Extraer URL de resultado
        image_url = None
        if "result" in result:
            image_url = result["result"].get("imageUrl") or result["result"].get("output_url")
        elif "output" in result:
            image_url = result["output"].get("imageUrl")

        if not image_url:
            raise KieAPIError("No se recibió URL de imagen en el resultado")

        return {
            "image_url": image_url,
            "task_id": task_id,
            "model": model,
            "mode": mode,
            "prompt": prompt,
            "metadata": result,
        }

    async def upscale_image(
        self,
        model: str,
        image_url: str,
        scale_factor: int = 2,
        **extra_params: Any,
    ) -> Dict[str, Any]:
        """
        Escala/upscale de imagen.

        Args:
            model: Modelo (ej: "topaz")
            image_url: URL de imagen a escalar
            scale_factor: Factor de escala (2, 4)

        Returns:
            Dict con upscaled_image_url
        """
        task_id = await self.create_task(
            model=model,
            action="upscale",
            params={
                "imageUrl": image_url,
                "scaleFactor": scale_factor,
                **extra_params,
            },
        )

        result = await self.wait_for_completion(task_id)

        upscaled_url = result.get("result", {}).get("imageUrl") or result.get(
            "output", {}
        ).get("imageUrl")

        return {
            "upscaled_image_url": upscaled_url,
            "task_id": task_id,
            "scale_factor": scale_factor,
        }

    # --- VIDEO ---

    async def generate_video(
        self,
        model: str,
        prompt: str,
        image_url: Optional[str] = None,
        duration: int = 5,
        aspect_ratio: str = "16:9",
        **extra_params: Any,
    ) -> Dict[str, Any]:
        """
        Genera video usando Kie.ai.

        Args:
            model: Modelo (ej: "kling", "sora2", "wan")
            prompt: Prompt de generación
            image_url: Imagen de referencia (opcional)
            duration: Duración en segundos
            aspect_ratio: Relación de aspecto

        Returns:
            Dict con video_url
        """
        params: Dict[str, Any] = {
            "prompt": prompt,
            "duration": duration,
            "aspectRatio": aspect_ratio,
        }

        if image_url:
            params["imageUrl"] = image_url

        params.update(extra_params)

        task_id = await self.create_task(
            model=model,
            action="generate",
            params=params,
        )

        result = await self.wait_for_completion(task_id)

        video_url = result.get("result", {}).get("videoUrl") or result.get(
            "output", {}
        ).get("video_url")

        return {
            "video_url": video_url,
            "task_id": task_id,
            "model": model,
            "duration": duration,
        }

    # --- AUDIO ---

    async def text_to_speech(
        self,
        model: str = "elevenlabs",
        text: str = "",
        voice_id: Optional[str] = None,
        **extra_params: Any,
    ) -> Dict[str, Any]:
        """
        Genera audio desde texto.

        Args:
            model: Modelo (ej: "elevenlabs")
            text: Texto a convertir
            voice_id: ID de voz específica

        Returns:
            Dict con audio_url
        """
        task_id = await self.create_task(
            model=model,
            action="tts",
            params={
                "text": text,
                "voiceId": voice_id or "default",
                **extra_params,
            },
        )

        result = await self.wait_for_completion(task_id)

        audio_url = result.get("result", {}).get("audioUrl") or result.get(
            "output", {}
        ).get("audio_url")

        return {
            "audio_url": audio_url,
            "task_id": task_id,
            "text": text,
        }

    async def speech_to_text(
        self,
        model: str = "elevenlabs",
        audio_url: str = "",
        **extra_params: Any,
    ) -> Dict[str, Any]:
        """
        Transcribe audio a texto.

        Args:
            model: Modelo
            audio_url: URL del audio
            language: Idioma (opcional)

        Returns:
            Dict con transcribed_text
        """
        task_id = await self.create_task(
            model=model,
            action="stt",
            params={
                "audioUrl": audio_url,
                **extra_params,
            },
        )

        result = await self.wait_for_completion(task_id)

        transcribed_text = result.get("result", {}).get("text") or result.get(
            "output", {}
        ).get("transcribedText")

        return {
            "transcribed_text": transcribed_text,
            "task_id": task_id,
            "audio_url": audio_url,
        }

    # --- CHAT ---

    async def chat_completion(
        self,
        model: str = "gemini-2.5-pro",
        messages: Optional[List[Dict[str, str]]] = None,
        prompt: Optional[str] = None,
        **extra_params: Any,
    ) -> Dict[str, Any]:
        """
        Completado de chat con modelos LLM.

        Args:
            model: Modelo (ej: "gemini-2.5-pro", "gemini-2.5-flash")
            messages: Lista de mensajes [{role, content}]
            prompt: Prompt simple (se convierte a formato messages)

        Returns:
            Dict con response
        """
        if messages is None:
            if prompt:
                messages = [{"role": "user", "content": prompt}]
            else:
                raise KieAPIError("Se requiere messages o prompt")

        task_id = await self.create_task(
            model=model,
            action="chat",
            params={
                "messages": messages,
                **extra_params,
            },
        )

        result = await self.wait_for_completion(task_id)

        response_text = result.get("result", {}).get("content") or result.get(
            "output", {}
        ).get("response")

        return {
            "response": response_text,
            "task_id": task_id,
            "model": model,
        }

    # ========================================================================
    # Utilidades
    # ========================================================================

    async def get_credits(self) -> Dict[str, Any]:
        """
        Obtiene créditos disponibles de la cuenta.

        Returns:
            Dict con créditos y información de cuenta
        """
        try:
            response = await self.client.get("/api/v1/chat/credit")

            if response.status_code != 200:
                error = response.json().get("msg", "Error consultando créditos")
                raise KieAPIError(error, code=response.status_code)

            return response.json()

        except httpx.RequestError as e:
            raise KieAPIError(f"Error de conexión: {str(e)}")

    async def get_download_url(self, file_id: str) -> str:
        """
        Obtiene URL temporal de descarga.

        Args:
            file_id: ID del archivo

        Returns:
            URL de descarga (válida por 20 minutos)
        """
        try:
            response = await self.client.post(
                "/api/v1/common/download-url",
                json={"fileId": file_id},
            )

            if response.status_code != 200:
                error = response.json().get("msg", "Error obteniendo URL")
                raise KieAPIError(error, code=response.status_code)

            data = response.json()
            return data.get("downloadUrl", "")

        except httpx.RequestError as e:
            raise KieAPIError(f"Error de conexión: {str(e)}")
